package repo

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

// RedisVoiceRepo は録音データをRedisに保存します
type RedisVoiceRepo struct {
	rdb *redis.Client
}

func NewRedisVoiceRepo(rdb *redis.Client) *RedisVoiceRepo {
	return &RedisVoiceRepo{rdb: rdb}
}

func voiceKey(roomId, userId string) string {
	return fmt.Sprintf("voice:%s:%s", roomId, userId)
}

func voiceScriptKey(roomId, userId string) string {
	return fmt.Sprintf("voice:%s:%s:script", roomId, userId)
}

// SaveVoice は音声データとスクリプトを保存します
func (r *RedisVoiceRepo) SaveVoice(ctx context.Context, roomId, userId string, data []byte, script string) error {
	if err := r.rdb.Set(ctx, voiceKey(roomId, userId), data, 0).Err(); err != nil {
		return err
	}
	if err := r.rdb.Set(ctx, voiceScriptKey(roomId, userId), script, 0).Err(); err != nil {
		return err
	}
	return nil
}

// GetVoice は音声データとスクリプトを取得します
func (r *RedisVoiceRepo) GetVoice(ctx context.Context, roomId, userId string) ([]byte, string, error) {
	data, err := r.rdb.Get(ctx, voiceKey(roomId, userId)).Bytes()
	if err != nil {
		return nil, "", err
	}
	script, err := r.rdb.Get(ctx, voiceScriptKey(roomId, userId)).Result()
	if err != nil && err != redis.Nil {
		return nil, "", err
	}
	return data, script, nil
}
