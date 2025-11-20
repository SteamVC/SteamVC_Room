package handlers

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"
)

// errorResponse はエラーレスポンスの構造
type errorResponse struct {
	Message string `json:"message"` // エラーメッセージ
}

// respondJSON はJSONレスポンスを返します
// payloadがnilの場合は空のレスポンスを返します
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

// respondError はエラーレスポンスを返します
func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, errorResponse{Message: msg})
}

// decodeJSON はリクエストボディからJSONをデコードします
// デコードに失敗した場合は、エラーレスポンスを返してfalseを返します
// 成功した場合はtrueを返します
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	// 最低限の防御: 大きすぎるリクエストを防ぐ（1MB制限）
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

// normalizeID はIDの前後の空白を削除して正規化します
func normalizeID(id string) string {
	return strings.TrimSpace(id)
}
