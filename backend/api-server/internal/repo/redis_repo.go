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

type RedisRoomRepo struct{ rdb *redis.Client }

func NewRedisRoomRepo(rdb *redis.Client) *RedisRoomRepo {
	return &RedisRoomRepo{rdb: rdb}
}

func roomKey(id string) string {
	return fmt.Sprintf("rooms:%s", id)
}
func usersKey(id string) string {
	return fmt.Sprintf("rooms:%s:users", id)
}
func userKey(rid, uid string) string {
	return fmt.Sprintf("users:%s:%s", rid, uid)
}

func sec(v int) time.Duration {
	return time.Duration(v) * time.Second
}

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

func (rr *RedisRoomRepo) RemoveUser(ctx context.Context, roomId, userId string) error {
	pipe := rr.rdb.TxPipeline()
	pipe.SRem(ctx, usersKey(roomId), userId)
	pipe.Del(ctx, userKey(roomId, userId))
	_, err := pipe.Exec(ctx)
	return err
}

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

func (rr *RedisRoomRepo) ExistsRoom(ctx context.Context, roomId string) (bool, error) {
	n, err := rr.rdb.Exists(ctx, roomKey(roomId)).Result()
	return n == 1, err
}
