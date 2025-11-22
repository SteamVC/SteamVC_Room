// Package service はビジネスロジックを担当します
// ルームの作成・管理・参加・退出などの処理を提供します
package service

import (
	"context"
	"errors"
	"time"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/idgen"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/models"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/repo"
)

// RoomService はルーム管理のビジネスロジックを提供します
type RoomService struct {
	repo   repo.RoomRepo // データ永続化を担当するリポジトリ
	idg    IDGenerator   // ルームID生成器
	ttlSec int           // ルームの有効期限（秒）
}

// IDGenerator はユニークなIDを生成するインターフェース
type IDGenerator interface {
	New() (string, error) // 新しいIDを生成
}

// roomIDGen はIDGeneratorの実装
type roomIDGen struct{}

// New は新しいルームIDを生成します
func (roomIDGen) New() (string, error) { return idgen.NewRoomID() }

// NewRoomIDGenerator は新しいRoomIDGeneratorを作成します
func NewRoomIDGenerator() IDGenerator {
	return roomIDGen{}
}

// NewRoomService は新しいRoomServiceを作成します
func NewRoomService(r repo.RoomRepo, idg IDGenerator, ttlSec int) *RoomService {
	return &RoomService{repo: r, idg: idg, ttlSec: ttlSec}
}

// Create は新しいルームを作成します
// 処理の流れ:
// 1. ユニークなルームIDを生成（重複チェック付き、最大10回リトライ）
// 2. ルームをRedisに保存
// 3. オーナーをルームに追加
// 戻り値: 生成されたルームID、エラー
func (s *RoomService) Create(ctx context.Context, owner models.User) (string, error) {
	const maxRetries = 10 // ID生成の最大リトライ回数

	var roomId string
	var err error

	// ID被りがあった場合、最大maxRetries回まで再生成を試みる
	for i := 0; i < maxRetries; i++ {
		roomId, err = s.idg.New()
		if err != nil {
			return "", err
		}

		// IDの重複チェック
		exists, err := s.repo.ExistsRoom(ctx, roomId)
		if err != nil {
			return "", err
		}
		if !exists {
			// 重複なし、ループを抜ける
			break
		}
		// 重複あり、次の試行へ
		if i == maxRetries-1 {
			return "", ErrRoomIDGenerationFailed
		}
	}

	room := models.Room{RoomId: roomId, OwnerId: owner.UserId, CreatedAt: time.Now().Unix()}
	if err := s.repo.CreateRoom(ctx, room, s.ttlSec); err != nil {
		return "", err
	}
	// 作成時にowner入室とする
	if err := s.repo.AddUser(ctx, roomId, owner, s.ttlSec); err != nil {
		// オーナー追加に失敗した場合は部屋を削除してロールバック
		_ = s.repo.DeleteRoom(ctx, roomId)
		return "", err
	}
	return roomId, nil
}

// Get は指定されたルームの情報と参加者一覧を取得します
// 戻り値: ルーム情報、参加者リスト、存在フラグ、エラー
func (s *RoomService) Get(ctx context.Context, roomId string) (models.Room, []models.User, bool, error) {
	r, ok, err := s.repo.GetRoom(ctx, roomId)
	if err != nil {
		return models.Room{}, nil, false, err
	}
	users, err := s.repo.ListUser(ctx, roomId)
	return r, users, ok, err
}

// Delete はルームを削除します（オーナーのみ実行可能）
// 処理の流れ:
// 1. ルームの存在確認
// 2. リクエストユーザーがオーナーかを確認
// 3. ルームを削除
func (s *RoomService) Delete(ctx context.Context, roomId, userId string) error {
	// 部屋情報を取得してオーナー確認
	room, exists, err := s.repo.GetRoom(ctx, roomId)
	if err != nil {
		return err
	}
	if !exists {
		return ErrRoomNotFound
	}
	if room.OwnerId != userId {
		return ErrNotRoomOwner
	}
	return s.repo.DeleteRoom(ctx, roomId)
}

// Join はユーザーをルームに参加させます
// ルームの存在確認を行った後、ユーザーを追加します
func (s *RoomService) Join(ctx context.Context, roomId string, user models.User) error {
	// 部屋の存在確認
	exists, err := s.repo.ExistsRoom(ctx, roomId)
	if err != nil {
		return err
	}
	if !exists {
		return ErrRoomNotFound
	}
	return s.repo.AddUser(ctx, roomId, user, s.ttlSec)
}

// Leave はユーザーをルームから退出させます
func (s *RoomService) Leave(ctx context.Context, roomId, userId string) error {
	return s.repo.RemoveUser(ctx, roomId, userId)
}

// Touch はルームのTTL（有効期限）を更新します
// ルームとそのユーザー情報の有効期限を延長します
func (s *RoomService) Touch(ctx context.Context, roomId string) error {
	return s.repo.TouchRoom(ctx, roomId, s.ttlSec)
}

// SetMuteState はユーザーのミュート状態を設定します
// ミュート状態はRedisに保存され、他のユーザーから確認できます
func (s *RoomService) SetMuteState(ctx context.Context, roomId, userId string, isMuted bool) error {
	if err := s.repo.UpdateUserMute(ctx, roomId, userId, isMuted); err != nil {
		if errors.Is(err, repo.ErrUserNotFound) {
			return ErrUserNotFound
		}
		return err
	}
	return nil
}

func (s *RoomService) SetUserName(ctx context.Context, roomId, userId, userName string) error {
	if err := s.repo.UpdateUserName(ctx, roomId, userId, userName); err != nil {
		if errors.Is(err, repo.ErrUserNotFound) {
			return ErrUserNotFound
		}
		return err
	}
	return nil
}
