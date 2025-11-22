package handlers

import (
	"io"
	"log"
	"net/http"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/service"
	"github.com/go-chi/chi/v5"
)

type VoiceHandler struct {
	svc *service.RoomService
}

func NewVoiceHandler(svc *service.RoomService) *VoiceHandler {
	return &VoiceHandler{svc: svc}
}

// Upload は multipart/form-data の file を受け取って保存します
func (h *VoiceHandler) Upload(w http.ResponseWriter, r *http.Request) {
	roomId := normalizeID(r.FormValue("roomId"))
	userId := normalizeID(r.FormValue("userId"))
	script := r.FormValue("script")

	if roomId == "" || userId == "" {
		respondError(w, http.StatusBadRequest, "roomId and userId are required")
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		log.Printf("upload voice: failed to read file: %v", err)
		respondError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		log.Printf("upload voice: failed to read file body: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to read file")
		return
	}

	if err := h.svc.UploadVoice(r.Context(), roomId, userId, data, script); err != nil {
		log.Printf("upload voice: save error roomId=%s userId=%s err=%v", roomId, userId, err)
		respondError(w, http.StatusInternalServerError, "failed to save voice")
		return
	}

	respondJSON(w, http.StatusOK, map[string]any{"success": true})
}

// Get は保存した音声を返します
func (h *VoiceHandler) Get(w http.ResponseWriter, r *http.Request) {
	roomId := normalizeID(chi.URLParam(r, "roomId"))
	userId := normalizeID(chi.URLParam(r, "userId"))

	if roomId == "" || userId == "" {
		respondError(w, http.StatusBadRequest, "roomId and userId are required")
		return
	}

	data, script, err := h.svc.GetVoice(r.Context(), roomId, userId)
	if err != nil {
		log.Printf("get voice: failed roomId=%s userId=%s err=%v", roomId, userId, err)
		respondError(w, http.StatusNotFound, "voice not found")
		return
	}

	// スクリプトはヘッダーで渡す（必要に応じて変更可）
	if script != "" {
		w.Header().Set("X-Voice-Script", script)
	}
	w.Header().Set("Content-Type", "audio/wav")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}
