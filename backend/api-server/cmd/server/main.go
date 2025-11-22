// Package main は SteamVC Room API サーバーのエントリーポイント
//
// このサーバーは以下の機能を提供します:
// - 音声チャットルームの作成・管理
// - ユーザーの参加・退出処理
// - WebSocketによるリアルタイム通信
// - Redisによるルーム情報の永続化
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

// main はアプリケーションの起動処理を行います
// 以下の手順で初期化とサーバー起動を行います:
// 1. 設定の読み込み
// 2. Redisクライアントの初期化と接続確認
// 3. 各レイヤー（Repository, Service, Handler）の初期化
// 4. HTTPサーバーの起動
// 5. Graceful Shutdownの実装
func main() {
	// 環境変数から設定を読み込む
	cfg := config.Load()

	// Redisクライアントの作成と接続設定
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

	// 依存性を注入しながら各レイヤーを初期化
	// Repository層: データの永続化を担当
	rr := repo.NewRedisRoomRepo(rdb)
	vr := repo.NewRedisVoiceRepo(rdb)
	// ID生成器: ユニークなルームIDを生成
	idg := service.NewRoomIDGenerator()
	// Service層: ビジネスロジックを担当
	svc := service.NewRoomServiceWithVoiceRepo(rr, vr, idg, cfg.RoomTTL)
	// Handler層: HTTPリクエストの処理を担当
	h := handlers.NewRoomHandler(svc)
	wsHandler := handlers.NewWebSocketHandler(svc)
	voiceHandler := handlers.NewVoiceHandler(svc)
	// ルーター: エンドポイントとハンドラーのマッピング
	router := httpx.NewRouter(h, wsHandler, voiceHandler, cfg.AllowedOrigin)

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
