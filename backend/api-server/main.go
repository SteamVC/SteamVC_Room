package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var (
	ctx         = context.Background()
	redisClient *redis.Client
	upgrader    = websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return true // CORS対応（本番環境では適切に設定）
		},
	}
)

type Room struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	CreatedAt   time.Time `json:"created_at"`
	Participants int      `json:"participants"`
	MaxParticipants int   `json:"max_participants"`
}

type CreateRoomRequest struct {
	Name            string `json:"name" binding:"required"`
	MaxParticipants int    `json:"max_participants"`
}

type JoinRoomRequest struct {
	RoomID string `json:"room_id" binding:"required"`
	UserID string `json:"user_id" binding:"required"`
}

func initRedis() {
	redisAddr := os.Getenv("REDIS_ADDR")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	redisClient = redis.NewClient(&redis.Options{
		Addr:     redisAddr,
		Password: "",
		DB:       0,
	})

	_, err := redisClient.Ping(ctx).Result()
	if err != nil {
		log.Fatalf("Redis接続失敗: %v", err)
	}

	log.Println("Redis接続成功")
}

func main() {
	initRedis()

	r := gin.Default()

	// CORS設定
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// ヘルスチェック
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// ルーム作成
	r.POST("/api/rooms", createRoom)

	// ルーム検索
	r.GET("/api/rooms/:id", getRoom)

	// ルーム一覧取得
	r.GET("/api/rooms", listRooms)

	// ルームに参加
	r.POST("/api/rooms/:id/join", joinRoom)

	// ルームから退出
	r.POST("/api/rooms/:id/leave", leaveRoom)

	// WebSocket接続
	r.GET("/ws/:room_id", handleWebSocket)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("API Server起動: :%s", port)
	r.Run(":" + port)
}

func createRoom(c *gin.Context) {
	var req CreateRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.MaxParticipants == 0 {
		req.MaxParticipants = 10
	}

	roomID := uuid.New().String()[:8] // 短縮ID

	room := Room{
		ID:              roomID,
		Name:            req.Name,
		CreatedAt:       time.Now(),
		Participants:    0,
		MaxParticipants: req.MaxParticipants,
	}

	// Redisに保存
	key := "room:" + roomID
	err := redisClient.HSet(ctx, key, map[string]interface{}{
		"id":               room.ID,
		"name":             room.Name,
		"created_at":       room.CreatedAt.Unix(),
		"participants":     room.Participants,
		"max_participants": room.MaxParticipants,
	}).Err()

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ルーム作成失敗"})
		return
	}

	// 有効期限設定（24時間）
	redisClient.Expire(ctx, key, 24*time.Hour)

	// ルーム一覧に追加
	redisClient.SAdd(ctx, "rooms", roomID)

	// SFUサーバーに通知（HTTP）
	notifySFUServer(roomID, "create")

	c.JSON(http.StatusCreated, room)
}

func getRoom(c *gin.Context) {
	roomID := c.Param("id")
	key := "room:" + roomID

	exists, err := redisClient.Exists(ctx, key).Result()
	if err != nil || exists == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "ルームが見つかりません"})
		return
	}

	data, err := redisClient.HGetAll(ctx, key).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ルーム情報取得失敗"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":               data["id"],
		"name":             data["name"],
		"participants":     data["participants"],
		"max_participants": data["max_participants"],
	})
}

func listRooms(c *gin.Context) {
	roomIDs, err := redisClient.SMembers(ctx, "rooms").Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "ルーム一覧取得失敗"})
		return
	}

	rooms := []map[string]interface{}{}
	for _, roomID := range roomIDs {
		key := "room:" + roomID
		data, err := redisClient.HGetAll(ctx, key).Result()
		if err != nil || len(data) == 0 {
			// 無効なルームは削除
			redisClient.SRem(ctx, "rooms", roomID)
			continue
		}
		// map[string]string を map[string]interface{} に変換
		room := make(map[string]interface{})
		for k, v := range data {
			room[k] = v
		}
		rooms = append(rooms, room)
	}

	c.JSON(http.StatusOK, gin.H{"rooms": rooms})
}

func joinRoom(c *gin.Context) {
	roomID := c.Param("id")
	var req JoinRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	key := "room:" + roomID
	exists, err := redisClient.Exists(ctx, key).Result()
	if err != nil || exists == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "ルームが見つかりません"})
		return
	}

	// 参加者を追加
	redisClient.SAdd(ctx, "room:"+roomID+":participants", req.UserID)
	participants := redisClient.SCard(ctx, "room:"+roomID+":participants").Val()
	redisClient.HSet(ctx, key, "participants", participants)

	c.JSON(http.StatusOK, gin.H{
		"message":      "ルームに参加しました",
		"room_id":      roomID,
		"participants": participants,
	})
}

func leaveRoom(c *gin.Context) {
	roomID := c.Param("id")
	var req JoinRoomRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	key := "room:" + roomID
	// 参加者を削除
	redisClient.SRem(ctx, "room:"+roomID+":participants", req.UserID)
	participants := redisClient.SCard(ctx, "room:"+roomID+":participants").Val()
	redisClient.HSet(ctx, key, "participants", participants)

	c.JSON(http.StatusOK, gin.H{
		"message":      "ルームから退出しました",
		"participants": participants,
	})
}

func handleWebSocket(c *gin.Context) {
	roomID := c.Param("room_id")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocketアップグレード失敗: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("WebSocket接続: Room %s", roomID)

	// メッセージ受信ループ
	for {
		var msg map[string]interface{}
		err := conn.ReadJSON(&msg)
		if err != nil {
			log.Printf("メッセージ読み込みエラー: %v", err)
			break
		}

		// メッセージをRedis Pub/Subでブロードキャスト
		redisClient.Publish(ctx, "room:"+roomID, msg)

		log.Printf("メッセージ受信: %v", msg)
	}
}

func notifySFUServer(roomID, action string) {
	sfuURL := os.Getenv("SFU_SERVER_URL")
	if sfuURL == "" {
		sfuURL = "http://localhost:3000"
	}

	// SFUサーバーにHTTP通知
	// 実装は簡略化、実際にはHTTPクライアントでPOSTリクエスト送信
	log.Printf("SFUサーバーに通知: %s, action: %s", sfuURL, action)
}
