package service

import (
	"context"
	"errors"
	"time"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/idgen"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/models"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/repo"
)

type RoomService struct {
	repo   repo.RoomRepo
	idg    IDGenerator
	ttlSec int
}

type IDGenerator interface {
	New() (string, error)
}

type roomIDGen struct{}

func (roomIDGen) New() (string, error) { return idgen.NewRoomID() }

func NewRoomIDGenerator() IDGenerator {
	return roomIDGen{}
}

func NewRoomService(r repo.RoomRepo, idg IDGenerator, ttlSec int) *RoomService {
	return &RoomService{repo: r, idg: idg, ttlSec: ttlSec}
}

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

func (s *RoomService) Get(ctx context.Context, roomId string) (models.Room, []models.User, bool, error) {
	r, ok, err := s.repo.GetRoom(ctx, roomId)
	if err != nil {
		return models.Room{}, nil, false, err
	}
	users, err := s.repo.ListUser(ctx, roomId)
	return r, users, ok, err
}

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

func (s *RoomService) Leave(ctx context.Context, roomId, userId string) error {
	return s.repo.RemoveUser(ctx, roomId, userId)
}

func (s *RoomService) Touch(ctx context.Context, roomId string) error {
	return s.repo.TouchRoom(ctx, roomId, s.ttlSec)
}

func (s *RoomService) SetMuteState(ctx context.Context, roomId, userId string, isMuted bool) error {
	if err := s.repo.UpdateUserMute(ctx, roomId, userId, isMuted); err != nil {
		if errors.Is(err, repo.ErrUserNotFound) {
			return ErrUserNotFound
		}
		return err
	}
	return nil
}
