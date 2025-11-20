package handlers

import (
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

type createRoomRequest struct {
	UserId    string `json:"userId"`
	UserName  string `json:"userName"`
	UserImage string `json:"userImage"`
}

func (r createRoomRequest) validate() error {
	return validateUserId(r.UserId)
}

type userRequest struct {
	UserId string `json:"userId"`
}

func (r userRequest) validate() error {
	return validateUserId(r.UserId)
}

type joinRequest struct {
	UserId    string `json:"userId"`
	UserName  string `json:"userName"`
	UserImage string `json:"userImage"`
}

func (r joinRequest) validate() error {
	return validateUserId(r.UserId)
}

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
