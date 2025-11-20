package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
)

type errorResponse struct {
	Message string `json:"message"`
}

func respondJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("failed to encode response: %v", err)
	}
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, errorResponse{Message: msg})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	// 最低限の防御: 大きすぎるリクエストを防ぐ
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20) // 1MB

	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()

	if err := dec.Decode(dst); err != nil {
		var syntaxErr *json.SyntaxError
		if errors.As(err, &syntaxErr) {
			respondError(w, http.StatusBadRequest, "invalid JSON payload")
			return false
		}
		respondError(w, http.StatusBadRequest, "bad request")
		return false
	}
	return true
}

func normalizeID(id string) string {
	return strings.TrimSpace(id)
}
