package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/service"
	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

// RoomHub は部屋ごとのWebSocket接続を管理します
// スレッドセーフな実装により、複数のgoroutineから同時にアクセス可能です
type RoomHub struct {
	rooms map[string]*Room // ルームIDをキーとしたルームのマップ
	mu    sync.RWMutex     // 読み書きのロック
}

// Room は1つの部屋のWebSocket接続を管理します
// 各ルームは複数のクライアント（ユーザー）の接続を保持します
type Room struct {
	roomId  string             // ルームID
	clients map[string]*Client // ユーザーIDをキーとしたクライアントのマップ
	mu      sync.RWMutex       // 読み書きのロック
}

// Client は1つのWebSocket接続を表します
// ユーザーとWebSocket接続の関連付け、表示名、アイコンを保持します
type Client struct {
	userId    string          // ユーザーID
	userName  string          // 表示名（通知用）
	userImage string          // アイコンURL（通知用）
	conn      *websocket.Conn // WebSocket接続
	room      *Room           // 所属するルーム
}

// WebSocketMessage はWebSocketで送受信するメッセージの構造
// すべてのメッセージはこの形式でやり取りされます
type WebSocketMessage struct {
	Type    string      `json:"type"`    // メッセージタイプ (例: "user_joined", "user_left", "mute_state")
	Payload interface{} `json:"payload"` // メッセージのペイロード（型は動的）
}

// LeavePayload はユーザー退出時のペイロード
type LeavePayload struct {
	UserId    string `json:"userId"`              // 退出するユーザーのID
	UserName  string `json:"userName,omitempty"`  // ユーザー名（オプショナル）
	UserImage string `json:"userImage,omitempty"` // ユーザーのアイコン画像URL（オプショナル）
}

// MuteStatePayload はミュート状態変更時のペイロード
type MuteStatePayload struct {
	UserId  string `json:"userId"`  // 対象ユーザーのID
	IsMuted bool   `json:"isMuted"` // ミュート状態（true: ミュート中、false: ミュート解除）
}

// JoinPayload はユーザー参加時のペイロード
type JoinPayload struct {
	UserId    string `json:"userId"`              // 参加するユーザーのID
	UserName  string `json:"userName,omitempty"`  // ユーザー名（オプショナル）
	UserImage string `json:"userImage,omitempty"` // ユーザーのアイコン画像URL（オプショナル）
}

// RenamePayload は表示名変更時のペイロード
type RenamePayload struct {
	UserId   string `json:"userId"`   // 対象ユーザーのID
	UserName string `json:"userName"` // 新しい表示名
}

// WebSocketHandler はWebSocket接続を処理するハンドラー
type WebSocketHandler struct {
	svc      *service.RoomService // ビジネスロジックを担当するサービス
	hub      *RoomHub             // WebSocket接続を管理するハブ
	upgrader websocket.Upgrader   // HTTPからWebSocketへのアップグレーダー
}

// NewWebSocketHandler は新しいWebSocketHandlerを作成します
func NewWebSocketHandler(s *service.RoomService) *WebSocketHandler {
	return &WebSocketHandler{
		svc: s,
		hub: &RoomHub{rooms: make(map[string]*Room)},
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool {
				// 本番環境では適切なOriginチェックを実装してください
				return true
			},
		},
	}
}

// HandleWebSocket はWebSocket接続を処理します
// 接続後、以下の処理を行います:
// 1. HTTPからWebSocketへのアップグレード
// 2. クライアントの登録
// 3. メッセージ受信ループの開始
// 4. 切断時の自動退出処理とクリーンアップ
func (h *WebSocketHandler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	roomId := normalizeID(chi.URLParam(r, "roomId"))
	userId := normalizeID(r.URL.Query().Get("userId"))
	var userName, userImage string

	if err := validateRoomId(roomId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := validateUserId(userId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if _, users, ok, err := h.svc.Get(r.Context(), roomId); err == nil && ok {
		for _, u := range users {
			if u.UserId == userId {
				userName = u.UserName
				userImage = u.UserImage
				break
			}
		}
	}

	// WebSocket接続にアップグレード
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	// クライアントを登録
	client := h.hub.registerClient(roomId, userId, userName, userImage, conn)
	defer func() {
		// WebSocket切断時にユーザーをルームから退出させる
		if err := h.svc.Leave(context.Background(), roomId, userId); err != nil {
			log.Printf("Failed to auto-leave on disconnect: roomId=%s, userId=%s, error=%v", roomId, userId, err)
		} else {
			log.Printf("User auto-left on disconnect: roomId=%s, userId=%s", roomId, userId)

			// 他のユーザーに退出を通知
			h.hub.broadcastToRoom(client.room, WebSocketMessage{
				Type: "user_left",
				Payload: LeavePayload{
					UserId: userId,
				},
			}, userId)
		}

		h.hub.unregisterClient(client)
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
		case "rename":
			h.handleRename(client, msg.Payload)
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
// 処理の流れ:
// 1. ペイロードをLeavePayload型にパース
// 2. リクエストユーザーの本人確認
// 3. サービス層で退出処理を実行
// 4. 同じルームの他のユーザーに退出を通知
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
	h.hub.broadcastToRoom(client.room, WebSocketMessage{
		Type: "user_left",
		Payload: LeavePayload{
			UserId:    leavePayload.UserId,
			UserName:  client.userName,
			UserImage: client.userImage,
		},
	}, client.userId)

	log.Printf("User left via WebSocket: roomId=%s, userId=%s", client.room.roomId, leavePayload.UserId)
}

// handleMuteState はユーザーのミュート状態変更を処理します
// 処理の流れ:
// 1. ペイロードをMuteStatePayload型にパース
// 2. リクエストユーザーの本人確認
// 3. サービス層でミュート状態を更新
// 4. 同じルームの他のユーザーに状態変更を通知
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
	h.hub.broadcastToRoom(client.room, WebSocketMessage{
		Type: "user_mute_state_changed",
		Payload: MuteStatePayload{
			UserId:  muteStatePayload.UserId,
			IsMuted: muteStatePayload.IsMuted,
		},
	}, client.userId)

	log.Printf("User mute state changed via WebSocket: roomId=%s, userId=%s, isMuted=%t", client.room.roomId, muteStatePayload.UserId, muteStatePayload.IsMuted)
}

// handleRename はユーザーの表示名変更を処理します
func (h *WebSocketHandler) handleRename(client *Client, payload interface{}) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("Failed to marshal rename payload: %v", err)
		return
	}

	var renamePayload RenamePayload
	if err := json.Unmarshal(payloadBytes, &renamePayload); err != nil {
		log.Printf("Failed to unmarshal rename payload: %v", err)
		return
	}

	if renamePayload.UserId != client.userId {
		log.Printf("UserId mismatch: expected %s, got %s", client.userId, renamePayload.UserId)
		return
	}
	if strings.TrimSpace(renamePayload.UserName) == "" {
		log.Printf("userName required for rename")
		return
	}

	if err := h.svc.SetUserName(context.Background(), client.room.roomId, renamePayload.UserId, strings.TrimSpace(renamePayload.UserName)); err != nil {
		log.Printf("Failed to rename user: %v", err)
		client.conn.WriteJSON(WebSocketMessage{
			Type: "error",
			Payload: map[string]string{
				"message": "Failed to rename user",
			},
		})
		return
	}

	// 他のユーザーに通知
	h.hub.broadcastToRoom(client.room, WebSocketMessage{
		Type: "user_renamed",
		Payload: RenamePayload{
			UserId:   renamePayload.UserId,
			UserName: strings.TrimSpace(renamePayload.UserName),
		},
	}, client.userId)

	client.userName = strings.TrimSpace(renamePayload.UserName)

	log.Printf("User renamed via WebSocket: roomId=%s, userId=%s, userName=%s", client.room.roomId, renamePayload.UserId, renamePayload.UserName)
}

// registerClient はクライアントを登録します
// 新しいユーザーがルームに接続した際に呼ばれます
// ルームが存在しない場合は新規作成し、既存の参加者に参加通知を送信します
func (hub *RoomHub) registerClient(roomId, userId, userName, userImage string, conn *websocket.Conn) *Client {
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
		userId:    userId,
		userName:  userName,
		userImage: userImage,
		conn:      conn,
		room:      room,
	}

	room.mu.Lock()
	room.clients[userId] = client
	room.mu.Unlock()

	// 既存の参加者に新しいユーザーの参加を通知
	hub.broadcastToRoom(room, WebSocketMessage{
		Type: "user_joined",
		Payload: JoinPayload{
			UserId:    userId,
			UserName:  userName,
			UserImage: userImage,
		},
	}, userId)

	log.Printf("User joined and broadcasted: roomId=%s, userId=%s", roomId, userId)

	return client
}

// unregisterClient はクライアントの登録を解除します
// WebSocket接続が切断された際に呼ばれます
// ルームが空になった場合はルーム自体を削除します
func (hub *RoomHub) unregisterClient(client *Client) {
	room := client.room
	room.mu.Lock()
	delete(room.clients, client.userId)
	isEmpty := len(room.clients) == 0
	room.mu.Unlock()

	// 部屋が空になったら削除
	if isEmpty {
		hub.deleteRoom(room.roomId)
	}
}

// deleteRoom はルームを削除します
// ルームが空になった際に呼ばれます
func (hub *RoomHub) deleteRoom(roomId string) {
	hub.mu.Lock()
	defer hub.mu.Unlock()
	delete(hub.rooms, roomId)
}

// broadcastToRoom は部屋内の全クライアントにメッセージを送信します（送信者を除く）
// 参加・退出・ミュート状態変更などのイベントを他のユーザーに通知する際に使用します
func (hub *RoomHub) broadcastToRoom(room *Room, msg WebSocketMessage, excludeUserId string) {
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
