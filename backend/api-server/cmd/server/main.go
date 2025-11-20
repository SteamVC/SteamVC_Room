package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/config"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/handlers"
	httpx "github.com/SteamVC/SteamVC_Room/backend/api-server/internal/http"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/repo"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/service"
	"github.com/redis/go-redis/v9"
)

func main() {
	cfg := config.Load()

	rdb := redis.NewClient(&redis.Options{
		Addr:         cfg.RedisAddr,
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
	svc := service.NewRoomService(rr, idg, cfg.RoomTTL)
	h := handlers.NewRoomHandler(svc)
	wsHandler := handlers.NewWebSocketHandler(svc)
	router := httpx.NewRouter(h, wsHandler, cfg.AllowedOrigin)

	srv := &http.Server{
		Addr:              cfg.APIAddr,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Graceful shutdown用のシグナルチャネル
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// サーバーを別goroutineで起動
	go func() {
		log.Printf("listening on %s", cfg.APIAddr)
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
