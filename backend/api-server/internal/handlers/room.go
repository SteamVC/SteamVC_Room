package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/models"
	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/service"
	"github.com/go-chi/chi/v5"
)

type RoomHandler struct {
	svc *service.RoomService
}

func NewRoomHandler(s *service.RoomService) *RoomHandler { return &RoomHandler{svc: s} }

func (h *RoomHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in struct {
		UserId    string `json:"userId"`
		UserName  string `json:"userName"`
		UserImage string `json:"userImage"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	uid := in.UserId
	if err := validateUserId(uid); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	id, err := h.svc.Create(r.Context(), models.User{UserId: uid, UserName: in.UserName, UserImage: in.UserImage})
	if err != nil {
		log.Printf("Create room error: %v", err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true, "roomId": id})
}

func (h *RoomHandler) Get(w http.ResponseWriter, r *http.Request) {
	roomId := chi.URLParam(r, "roomId")
	if err := validateRoomId(roomId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	room, users, ok, err := h.svc.Get(r.Context(), roomId)
	if err != nil {
		log.Printf("Get room error (roomId=%s): %v", roomId, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	if !ok {
		http.NotFound(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"room": room, "users": users})
}

func (h *RoomHandler) Delete(w http.ResponseWriter, r *http.Request) {
	roomId := chi.URLParam(r, "roomId")
	if err := validateRoomId(roomId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var in struct {
		UserId string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := validateUserId(in.UserId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.svc.Delete(r.Context(), roomId, in.UserId); err != nil {
		log.Printf("Delete room error (roomId=%s, userId=%s): %v", roomId, in.UserId, err)
		if errors.Is(err, service.ErrNotRoomOwner) {
			http.Error(w, err.Error(), http.StatusForbidden)
			return
		}
		if errors.Is(err, service.ErrRoomNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (h *RoomHandler) Join(w http.ResponseWriter, r *http.Request) {
	roomId := chi.URLParam(r, "roomId")
	if err := validateRoomId(roomId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var in models.User
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := validateUserId(in.UserId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.svc.Join(r.Context(), roomId, in); err != nil {
		log.Printf("Join room error (roomId=%s, userId=%s): %v", roomId, in.UserId, err)
		if errors.Is(err, service.ErrRoomNotFound) {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (h *RoomHandler) Leave(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "roomId")
	if err := validateRoomId(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	var in struct {
		UserId string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if err := validateUserId(in.UserId); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.svc.Leave(r.Context(), id, in.UserId); err != nil {
		log.Printf("Leave room error (roomId=%s, userId=%s): %v", id, in.UserId, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

func (h *RoomHandler) Touch(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "roomId")
	if err := validateRoomId(id); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	if err := h.svc.Touch(r.Context(), id); err != nil {
		log.Printf("Touch room error (roomId=%s): %v", id, err)
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"success": true})
}

// validateUserId checks if userId is non-empty
func validateUserId(userId string) error {
	if userId == "" {
		return fmt.Errorf("userId required")
	}
	return nil
}

// validateRoomId checks if roomId is non-empty
func validateRoomId(roomId string) error {
	if roomId == "" {
		return fmt.Errorf("roomId required")
	}
	return nil
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-type", "application/json")
	w.WriteHeader(code)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("JSON encode error: %v", err)
	}
}
