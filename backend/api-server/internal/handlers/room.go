// Package handlers はHTTPリクエストの処理を担当します
// ルーム管理とWebSocket通信のハンドラーを提供します
package handlers

import (
	"log"
	"net/http"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/models"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/service"
	"github.com/go-chi/chi/v5"
)

// RoomHandler はルーム関連のHTTPリクエストを処理するハンドラー
type RoomHandler struct {
	svc *service.RoomService // ビジネスロジックを担当するサービス
}

// NewRoomHandler は新しいRoomHandlerを作成します
func NewRoomHandler(s *service.RoomService) *RoomHandler { return &RoomHandler{svc: s} }

// createRoomRequest はルーム作成APIのリクエストボディ
type createRoomRequest struct {
	UserId    string `json:"userId"`    // ルームを作成するユーザーのID
	UserName  string `json:"userName"`  // ユーザー名
	UserImage string `json:"userImage"` // ユーザーのアイコン画像URL
}

// validate はリクエストのバリデーションを行います
func (r createRoomRequest) validate() error {
	return validateUserId(r.UserId)
}

// userRequest はユーザーIDのみを含むリクエストボディ
type userRequest struct {
	UserId string `json:"userId"` // 対象ユーザーのID
}

// validate はリクエストのバリデーションを行います
func (r userRequest) validate() error {
	return validateUserId(r.UserId)
}

// joinRequest はルーム参加APIのリクエストボディ
type joinRequest struct {
	UserId    string `json:"userId"`    // 参加するユーザーのID
	UserName  string `json:"userName"`  // ユーザー名
	UserImage string `json:"userImage"` // ユーザーのアイコン画像URL
}

// validate はリクエストのバリデーションを行います
func (r joinRequest) validate() error {
	return validateUserId(r.UserId)
}

// Create は新しいルームを作成します
// リクエスト: POST /rooms
// レスポンス: {"success": true, "roomId": "生成されたルームID"}
func (h *RoomHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in createRoomRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := in.validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	owner := models.User{UserId: normalizeID(in.UserId), UserName: in.UserName, UserImage: in.UserImage}
	id, err := h.svc.Create(r.Context(), owner)
	if err != nil {
		log.Printf("Create room error: %v", err)
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true, "roomId": id})
}

// Get は指定されたルームの情報と参加者一覧を取得します
// リクエスト: GET /rooms/{roomId}
// レスポンス: {"room": {...}, "users": [...]}
func (h *RoomHandler) Get(w http.ResponseWriter, r *http.Request) {
	roomId := normalizeID(chi.URLParam(r, "roomId"))
	if err := validateRoomId(roomId); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	room, users, ok, err := h.svc.Get(r.Context(), roomId)
	if err != nil {
		log.Printf("Get room error (roomId=%s): %v", roomId, err)
		respondError(w, http.StatusInternalServerError, "internal error")
		return
	}
	if !ok {
		respondError(w, http.StatusNotFound, "room not found")
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"room": room, "users": users})
}

// Delete はルームを削除します（オーナーのみ実行可能）
// リクエスト: DELETE /rooms/{roomId}
// リクエストボディ: {"userId": "実行ユーザーのID"}
// レスポンス: {"success": true}
func (h *RoomHandler) Delete(w http.ResponseWriter, r *http.Request) {
	roomId := normalizeID(chi.URLParam(r, "roomId"))
	if err := validateRoomId(roomId); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	var in userRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := in.validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.svc.Delete(r.Context(), roomId, normalizeID(in.UserId)); err != nil {
		log.Printf("Delete room error (roomId=%s, userId=%s): %v", roomId, in.UserId, err)
		h.writeServiceError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

// Join はユーザーをルームに参加させます
// リクエスト: POST /rooms/{roomId}/join
// リクエストボディ: {"userId": "...", "userName": "...", "userImage": "..."}
// レスポンス: {"success": true}
func (h *RoomHandler) Join(w http.ResponseWriter, r *http.Request) {
	roomId := normalizeID(chi.URLParam(r, "roomId"))
	if err := validateRoomId(roomId); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	var in joinRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := in.validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	user := models.User{UserId: normalizeID(in.UserId), UserName: in.UserName, UserImage: in.UserImage}
	if err := h.svc.Join(r.Context(), roomId, user); err != nil {
		log.Printf("Join room error (roomId=%s, userId=%s): %v", roomId, in.UserId, err)
		h.writeServiceError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

// Leave はユーザーをルームから退出させます
// リクエスト: POST /rooms/{roomId}/leave
// リクエストボディ: {"userId": "退出するユーザーのID"}
// レスポンス: {"success": true}
func (h *RoomHandler) Leave(w http.ResponseWriter, r *http.Request) {
	id := normalizeID(chi.URLParam(r, "roomId"))
	if err := validateRoomId(id); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	var in userRequest
	if !decodeJSON(w, r, &in) {
		return
	}
	if err := in.validate(); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.svc.Leave(r.Context(), id, normalizeID(in.UserId)); err != nil {
		log.Printf("Leave room error (roomId=%s, userId=%s): %v", id, in.UserId, err)
		h.writeServiceError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

// Touch はルームのTTL（有効期限）を更新します
// リクエスト: POST /rooms/{roomId}/touch
// レスポンス: {"success": true}
func (h *RoomHandler) Touch(w http.ResponseWriter, r *http.Request) {
	id := normalizeID(chi.URLParam(r, "roomId"))
	if err := validateRoomId(id); err != nil {
		respondError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.svc.Touch(r.Context(), id); err != nil {
		log.Printf("Touch room error (roomId=%s): %v", id, err)
		h.writeServiceError(w, err)
		return
	}
	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

// writeServiceError はサービス層のエラーを適切なHTTPステータスコードに変換してレスポンスします
func (h *RoomHandler) writeServiceError(w http.ResponseWriter, err error) {
	switch err {
	case service.ErrNotRoomOwner:
		respondError(w, http.StatusForbidden, err.Error())
	case service.ErrRoomNotFound:
		respondError(w, http.StatusNotFound, err.Error())
	case service.ErrUserNotFound:
		respondError(w, http.StatusNotFound, err.Error())
	default:
		respondError(w, http.StatusInternalServerError, "internal error")
	}
}
