package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// 本番環境では適切なOriginチェックを実装してください
		return true
	},
}

// RoomHub は部屋ごとのWebSocket接続を管理します
type RoomHub struct {
	rooms map[string]*Room
	mu    sync.RWMutex
}

// Room は1つの部屋のWebSocket接続を管理します
type Room struct {
	roomId  string
	clients map[string]*Client
	mu      sync.RWMutex
}

// Client は1つのWebSocket接続を表します
type Client struct {
	userId string
	conn   *websocket.Conn
	room   *Room
}

var hub = &RoomHub{
	rooms: make(map[string]*Room),
}

// WebSocketMessage はWebSocketで送受信するメッセージの構造
type WebSocketMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// LeavePayload はユーザー退出時のペイロード
type LeavePayload struct {
	UserId    string `json:"userId"`
	UserName  string `json:"userName,omitempty"`
	UserImage string `json:"userImage,omitempty"`
}

// MuteStatePayload はミュート用のペイロード
type MuteStatePayload struct {
	UserId  string `json:"userId"`
	IsMuted bool   `json:"isMuted"`
}

type WebSocketHandler struct {
	svc *service.RoomService
}

func NewWebSocketHandler(s *service.RoomService) *WebSocketHandler {
	return &WebSocketHandler{svc: s}
}

// HandleWebSocket はWebSocket接続を処理します
func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	roomId := chi.URLParam(r, "roomId")
	userId := r.URL.Query().Get("userId")

	if err := validateRoomId(roomId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateUserId(userId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// WebSocket接続にアップグレード
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// クライアントを登録
	client := registerClient(roomId, userId, conn)
	defer func() {
		unregisterClient(client)
		conn.Close()
	}()

	log.Printf("WebSocket connected: roomId=%s, userId=%s", roomId, userId)

	// メッセージ受信ループ
	for {
		var msg WebSocketMessage
		err := conn.ReadJSON(&msg)
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error: %v", err)
			}
			break
		}

		// メッセージタイプに応じて処理
		switch msg.Type {
		case "leave":
			h.handleLeave(client, msg.Payload)
		case "mute_state":
			h.handleMuteState(client, msg.Payload)
		case "ping":
			// ping/pongで接続を維持
			if err := conn.WriteJSON(WebSocketMessage{Type: "pong"}); err != nil {
				log.Printf("Failed to send pong: %v", err)
				break
			}
		default:
			log.Printf("Unknown message type: %s", msg.Type)
		}
	}
}

// handleLeave はユーザーの退出を処理します
func (h *WebSocketHandler) handleLeave(client *Client, payload interface{}) {
	// payloadをLeavePayloadに変換
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal payload: %v", err)
		return
	}

	var leavePayload LeavePayload
	if err := json.Unmarshal(payloadBytes, &leavePayload); err != nil {
		log.Printf("Failed to unmarshal leave payload: %v", err)
		return
	}

	// userIdの検証
	if leavePayload.UserId != client.userId {
		log.Printf("UserId mismatch: expected %s, got %s", client.userId, leavePayload.UserId)
		return
	}

	// サービス層でユーザーを退出させる
	if err := h.svc.Leave(context.Background(), client.room.roomId, leavePayload.UserId); err != nil {
		log.Printf("Failed to leave room: %v", err)
		// エラーをクライアントに送信
		client.conn.WriteJSON(WebSocketMessage{
			Type: "error",
			Payload: map[string]string{
				"message": "Failed to leave room",
			},
		})
		return
	}

	// 同じ部屋の他のユーザーに退出を通知
	broadcastToRoom(client.room, WebSocketMessage{
		Type: "user_left",
		Payload: LeavePayload{
			UserId:    leavePayload.UserId,
			UserName:  leavePayload.UserName,
			UserImage: leavePayload.UserImage,
		},
	}, client.userId)

	log.Printf("User left via WebSocket: roomId=%s, userId=%s", client.room.roomId, leavePayload.UserId)
}

func (h *WebSocketHandler) handleMuteState(client *Client, payload interface{}) {
	// payloadをMutePayloadに変換
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal mute payload: %v", err)
		return
	}

	var muteStatePayload MuteStatePayload
	if err := json.Unmarshal(payloadBytes, &muteStatePayload); err != nil {
		log.Printf("Failed to unmarshal mute payload: %v", err)
		return
	}

	// userIdの検証
	if muteStatePayload.UserId != client.userId {
		log.Printf("UserId mismatch: expected %s, got %s", client.userId, muteStatePayload.UserId)
		return
	}

	if err := h.svc.SetMuteState(context.Background(), client.room.roomId, muteStatePayload.UserId, muteStatePayload.IsMuted); err != nil {
		log.Printf("Failed to update mute state: %v", err)
		client.conn.WriteJSON(WebSocketMessage{
			Type: "error",
			Payload: map[string]string{
				"message": "Failed to update mute state",
			},
		})
		return
	}

	// 他のユーザーに通知
	broadcastToRoom(client.room, WebSocketMessage{
		Type: "user_mute_state_changed",
		Payload: MuteStatePayload{
			UserId:  muteStatePayload.UserId,
			IsMuted: muteStatePayload.IsMuted,
		},
	}, client.userId)

	log.Printf("User mute state changed via WebSocket: roomId=%s, userId=%s, isMuted=%t", client.room.roomId, muteStatePayload.UserId, muteStatePayload.IsMuted)
}

// registerClient はクライアントを登録します
func registerClient(roomId, userId string, conn *websocket.Conn) *Client {
	hub.mu.Lock()
	defer hub.mu.Unlock()

	room, exists := hub.rooms[roomId]
	if !exists {
		room = &Room{
			roomId:  roomId,
			clients: make(map[string]*Client),
		}
		hub.rooms[roomId] = room
	}

	client := &Client{
		userId: userId,
		conn:   conn,
		room:   room,
	}

	room.mu.Lock()
	room.clients[userId] = client
	room.mu.Unlock()

	return client
}

// unregisterClient はクライアントの登録を解除します
func unregisterClient(client *Client) {
	room := client.room
	room.mu.Lock()
	delete(room.clients, client.userId)
	isEmpty := len(room.clients) == 0
	room.mu.Unlock()

	// 部屋が空になったら削除
	if isEmpty {
		hub.mu.Lock()
		delete(hub.rooms, room.roomId)
		hub.mu.Unlock()
	}
}

// broadcastToRoom は部屋内の全クライアントにメッセージを送信します（送信者を除く）
func broadcastToRoom(room *Room, msg WebSocketMessage, excludeUserId string) {
	room.mu.RLock()
	defer room.mu.RUnlock()

	for userId, client := range room.clients {
		if userId == excludeUserId {
			continue
		}
		if err := client.conn.WriteJSON(msg); err != nil {
			log.Printf("Failed to send message to userId=%s: %v", userId, err)
		}
	}
}
