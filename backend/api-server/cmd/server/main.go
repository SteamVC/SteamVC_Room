package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/handlers"
	httpx "github.com/SteamVC/SteamVC_Room/backend/api-server/internal/http"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/repo"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/service"
	"github.com/redis/go-redis/v9"
)

const (
	defaultTTLSec = 60 * 60 // 1時間
)

func getEnvOrDefault(key, def string) string {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	return v
}

func main() {
	addr := getEnvOrDefault("API_ADDR", ":8080")
	redisAddr := getEnvOrDefault("REDIS_ADDR", "localhost:6379")
	ttlSec := defaultTTLSec

	rdb := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
		PoolSize:     10,              // 接続プールサイズ
		MinIdleConns: 5,               // 最小アイドル接続数
		MaxRetries:   3,               // リトライ回数
		DialTimeout:  5 * time.Second, // 接続タイムアウト
		ReadTimeout:  3 * time.Second, // 読み込みタイムアウト
		WriteTimeout: 3 * time.Second, // 書き込みタイムアウト
		PoolTimeout:  4 * time.Second, // プールからの取得タイムアウト
	})

	// Redis接続確認
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("failed to connect to redis: %v", err)
	}
	log.Println("connected to redis")

	rr := repo.NewRedisRoomRepo(rdb)
	idg := service.NewRoomIDGenerator()
	svc := service.NewRoomService(rr, idg, ttlSec)
	h := handlers.NewRoomHandler(svc)
	router := httpx.NewRouter(h)

	srv := &http.Server{
		Addr:              addr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Graceful shutdown用のシグナルチャネル
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// サーバーを別goroutineで起動
	go func() {
		log.Printf("listening on %s", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// シャットダウンシグナルを待つ
	<-sigChan
	log.Println("shutdown signal received, shutting down gracefully...")

	// 30秒のタイムアウトでGraceful Shutdown
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("server shutdown error: %v", err)
	}

	log.Println("server stopped")
}
