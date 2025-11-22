// Package repo はデータの永続化を担当します
// Redisを使用してルームとユーザー情報を管理します
package repo

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/models"
	"github.com/redis/go-redis/v9"
)

// ErrUserNotFound はユーザーが見つからない場合のエラー
var ErrUserNotFound = errors.New("user not found")

// RedisRoomRepo はRedisを使用したルームリポジトリの実装
type RedisRoomRepo struct{ rdb *redis.Client }

// NewRedisRoomRepo は新しいRedisRoomRepoを作成します
func NewRedisRoomRepo(rdb *redis.Client) *RedisRoomRepo {
	return &RedisRoomRepo{rdb: rdb}
}

// roomKey はルーム情報のRedisキーを生成します
func roomKey(id string) string {
	return fmt.Sprintf("rooms:%s", id)
}

// usersKey はルームの参加者リストのRedisキーを生成します
func usersKey(id string) string {
	return fmt.Sprintf("rooms:%s:users", id)
}

// userKey はユーザー情報のRedisキーを生成します
func userKey(rid, uid string) string {
	return fmt.Sprintf("users:%s:%s", rid, uid)
}

// sec は秒数をtime.Durationに変換します
func sec(v int) time.Duration {
	return time.Duration(v) * time.Second
}

// CreateRoom は新しいルームをRedisに保存します
// SET NXコマンドを使用して、既存のルームIDとの重複を防ぎます
func (rr *RedisRoomRepo) CreateRoom(ctx context.Context, room models.Room, ttlSec int) error {
	b, err := json.Marshal(room)
	if err != nil {
		return err
	}
	d := sec(ttlSec)
	ok, err := rr.rdb.SetArgs(ctx, roomKey(room.RoomId), b, redis.SetArgs{Mode: "NX", TTL: d}).Result()
	if err != nil {
		return err
	}
	if ok != "OK" {
		return errors.New("room already exists")
	}
	return nil
}

// GetRoom は指定されたルームの情報を取得します
// ルームが存在しない場合は、存在フラグがfalseで返ります
func (rr *RedisRoomRepo) GetRoom(ctx context.Context, roomId string) (models.Room, bool, error) {
	val, err := rr.rdb.Get(ctx, roomKey(roomId)).Bytes()
	if err == redis.Nil { // データがない
		return models.Room{}, false, nil
	}
	if err != nil { // エラー
		return models.Room{}, false, err
	}
	var r models.Room
	if err := json.Unmarshal(val, &r); err != nil {
		return models.Room{}, false, err
	}
	return r, true, nil
}

// DeleteRoom はルームとその関連データを削除します
// Luaスクリプトを使用してアトミックに処理します
// 削除対象: ルーム情報、参加者リスト、全参加者の個別データ
func (rr *RedisRoomRepo) DeleteRoom(ctx context.Context, roomId string) error {
	// Luaスクリプトでアトミックに処理
	script := `
		local room_key = KEYS[1]
		local users_key = KEYS[2]
		local room_id = ARGV[1]

		-- 参加者一覧を取得
		local user_ids = redis.call('SMEMBERS', users_key)

		-- 削除するキーリストを構築
		local keys_to_delete = {room_key, users_key}
		for _, uid in ipairs(user_ids) do
			local user_key = 'users:' .. room_id .. ':' .. uid
			table.insert(keys_to_delete, user_key)
		end

		-- 一括削除
		if #keys_to_delete > 0 then
			redis.call('DEL', unpack(keys_to_delete))
		end

		return 'OK'
	`

	return rr.rdb.Eval(ctx, script, []string{roomKey(roomId), usersKey(roomId)}, roomId).Err()
}

// AddUser はユーザーをルームに追加します
// トランザクションパイプラインを使用して、以下を同時に実行します:
// 1. ユーザー情報の保存
// 2. 参加者リストへの追加
// 3. TTLの更新
func (rr *RedisRoomRepo) AddUser(ctx context.Context, roomId string, user models.User, ttlSec int) error {
	b, err := json.Marshal(user)
	if err != nil {
		return err
	}
	d := sec(ttlSec)
	pipe := rr.rdb.TxPipeline()
	pipe.Set(ctx, userKey(roomId, user.UserId), b, d) // 部屋内にユーザー情報を追加
	pipe.SAdd(ctx, usersKey(roomId), user.UserId)     // 部屋内の参加者setに追加
	pipe.Expire(ctx, usersKey(roomId), d)
	pipe.Expire(ctx, roomKey(roomId), d)
	_, err = pipe.Exec(ctx)
	return err
}

// RemoveUser はユーザーをルームから削除します
// トランザクションパイプラインを使用して、参加者リストとユーザー情報を削除します
func (rr *RedisRoomRepo) RemoveUser(ctx context.Context, roomId, userId string) error {
	pipe := rr.rdb.TxPipeline()
	pipe.SRem(ctx, usersKey(roomId), userId)
	pipe.Del(ctx, userKey(roomId, userId))
	_, err := pipe.Exec(ctx)
	return err
}

// ListUser はルームの参加者一覧を取得します
// 処理の流れ:
// 1. 参加者リストからユーザーIDを取得
// 2. 各ユーザーの詳細情報をMGETで一括取得
// 3. JSONをデシリアライズしてUserスライスに変換
func (rr *RedisRoomRepo) ListUser(ctx context.Context, roomId string) ([]models.User, error) {
	ids, err := rr.rdb.SMembers(ctx, usersKey(roomId)).Result()
	if err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return []models.User{}, nil
	}

	// ユーザーキーを構築
	keys := make([]string, len(ids))
	for i, id := range ids {
		keys[i] = userKey(roomId, id)
	}

	// 一括取得
	vals, err := rr.rdb.MGet(ctx, keys...).Result()
	if err != nil {
		return nil, err
	}

	res := make([]models.User, 0, len(ids))
	for _, val := range vals {
		if val == nil {
			continue
		}
		b, ok := val.(string)
		if !ok {
			continue
		}
		var u models.User
		if json.Unmarshal([]byte(b), &u) == nil {
			res = append(res, u)
		}
	}
	return res, nil
}

// UpdateUserMute はユーザーのミュート状態を更新します
// 処理の流れ:
// 1. ユーザー情報を取得
// 2. ミュート状態を更新
// 3. 元のTTLを維持してRedisに保存
func (rr *RedisRoomRepo) UpdateUserMute(ctx context.Context, roomId, userId string, isMuted bool) error {
	return rr.updateUser(ctx, roomId, userId, func(user *models.User) {
		user.IsMuted = isMuted
	})
}

func (rr *RedisRoomRepo) UpdateUserName(ctx context.Context, roomId, userId, userName string) error {
	return rr.updateUser(ctx, roomId, userId, func(user *models.User) {
		user.UserName = userName
	})
}

func (rr *RedisRoomRepo) updateUser(ctx context.Context, roomId, userId string, mutate func(*models.User)) error {
	key := userKey(roomId, userId)

	val, err := rr.rdb.Get(ctx, key).Bytes()
	if err == redis.Nil {
		return ErrUserNotFound
	}
	if err != nil {
		return err
	}

	var user models.User
	if err := json.Unmarshal(val, &user); err != nil {
		return err
	}

	mutate(&user)

	data, err := json.Marshal(user)
	if err != nil {
		return err
	}

	ttl, err := rr.rdb.TTL(ctx, key).Result()
	if err != nil {
		return err
	}

	if ttl > 0 {
		return rr.rdb.Set(ctx, key, data, ttl).Err()
	}
	return rr.rdb.Set(ctx, key, data, 0).Err()
}

// TouchRoom はルームとその関連データのTTLを更新します
// Luaスクリプトを使用してアトミックに処理します
// 更新対象: ルーム情報、参加者リスト、全参加者の個別データ
func (rr *RedisRoomRepo) TouchRoom(ctx context.Context, roomId string, ttlSec int) error {
	// Luaスクリプトでアトミックに処理
	script := `
		local room_key = KEYS[1]
		local users_key = KEYS[2]
		local ttl = tonumber(ARGV[1])
		local room_id = ARGV[2]

		redis.call('EXPIRE', room_key, ttl)
		redis.call('EXPIRE', users_key, ttl)

		local user_ids = redis.call('SMEMBERS', users_key)
		for _, uid in ipairs(user_ids) do
			local user_key = 'users:' .. room_id .. ':' .. uid
			redis.call('EXPIRE', user_key, ttl)
		end

		return 'OK'
	`

	return rr.rdb.Eval(ctx, script, []string{roomKey(roomId), usersKey(roomId)}, ttlSec, roomId).Err()
}

// ExistsRoom はルームが存在するかを確認します
func (rr *RedisRoomRepo) ExistsRoom(ctx context.Context, roomId string) (bool, error) {
	n, err := rr.rdb.Exists(ctx, roomKey(roomId)).Result()
	return n == 1, err
}
