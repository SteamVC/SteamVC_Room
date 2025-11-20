package config

import (
	"log"
	"os"
	"strconv"
	"strings"
)

const (
	defaultAPIAddr    = ":8080"
	defaultRedisAddr  = "localhost:6379"
	defaultRoomTTLSec = 60 * 60
)

var defaultAllowedOrigins = []string{
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3002",
}

type Config struct {
	APIAddr       string
	RedisAddr     string
	RoomTTL       int
	AllowedOrigin []string
}

func Load() Config {
	return Config{
		APIAddr:       envOr("API_ADDR", defaultAPIAddr),
		RedisAddr:     envOr("REDIS_ADDR", defaultRedisAddr),
		RoomTTL:       envInt("ROOM_TTL_SEC", defaultRoomTTLSec),
		AllowedOrigin: envCSV("CORS_ALLOWED_ORIGINS", defaultAllowedOrigins),
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

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
