// Package config はアプリケーションの設定を管理します
// 環境変数から設定を読み込み、デフォルト値を提供します
package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

const (
	defaultAPIAddr    = ":8080"           // APIサーバーのデフォルトリッスンアドレス
	defaultRedisAddr  = "localhost:6379"  // Redisのデフォルト接続先
	defaultRoomTTLSec = 60 * 60           // ルームのデフォルトTTL（1時間）
)

// defaultAllowedOrigins はCORSで許可するデフォルトのオリジン一覧
var defaultAllowedOrigins = []string{
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3002",
}

// Config はアプリケーションの設定を保持します
type Config struct {
	APIAddr       string   // APIサーバーのリッスンアドレス
	RedisAddr     string   // Redisの接続先
	RoomTTL       int      // ルームのTTL（秒）
	AllowedOrigin []string // CORSで許可するオリジン一覧
}

// Load は環境変数から設定を読み込みます
// 環境変数が設定されていない場合はデフォルト値を使用します
func Load() Config {
	return Config{
		APIAddr:       envOr("API_ADDR", defaultAPIAddr),
		RedisAddr:     envOr("REDIS_ADDR", defaultRedisAddr),
		RoomTTL:       envInt("ROOM_TTL_SEC", defaultRoomTTLSec),
		AllowedOrigin: envCSV("CORS_ALLOWED_ORIGINS", defaultAllowedOrigins),
	}
}

// envOr は環境変数から文字列を取得します
// 環境変数が設定されていない場合はデフォルト値を返します
func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// envInt は環境変数から整数を取得します
// 環境変数が設定されていない、または無効な値の場合はデフォルト値を返します
func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		i, err := strconv.Atoi(v)
		if err != nil {
			log.Printf("invalid %s=%s, fallback to default (%d)", key, v, def)
			return def
		}
		return i
	}
	return def
}

// envCSV は環境変数からカンマ区切りの文字列リストを取得します
// 環境変数が設定されていない、または空の場合はデフォルト値を返します
func envCSV(key string, def []string) []string {
	if v := os.Getenv(key); v != "" {
		parts := strings.Split(v, ",")
		out := make([]string, 0, len(parts))
		for _, p := range parts {
			if trimmed := strings.TrimSpace(p); trimmed != "" {
				out = append(out, trimmed)
			}
		}
		if len(out) > 0 {
			return out
		}
	}
	return def
}
