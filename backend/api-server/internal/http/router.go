package http

import (
	"net/http"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/handlers"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

func NewRouter(h *handlers.RoomHandler, wsHandler *handlers.WebSocketHandler, allowedOrigins []string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID, middleware.RealIP, middleware.Logger, middleware.Recoverer)

	if len(allowedOrigins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   allowedOrigins,
			AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
			ExposedHeaders:   []string{"Link"},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	r.Get("/api/v1/healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })

	r.Route("/api/v1/room", func(r chi.Router) {
		r.Post("/create", h.Create)
		r.Get("/{roomId}", h.Get)
		r.Delete("/delete/{roomId}", h.Delete)
		r.Post("/{roomId}/join", h.Join)
		r.Post("/{roomId}/leave", h.Leave)
		r.Post("/{roomId}/touch", h.Touch)
		r.Post("/{roomId}/rename", h.Rename)
		// WebSocketエンドポイント
		r.Get("/{roomId}/ws", wsHandler.HandleWebSocket)
	})

	// 旧API互換性エンドポイント（フロント担当が書いた仕様）
	r.Route("/api/rooms", func(r chi.Router) {
		r.Get("/{roomId}", h.Get) // ルーム存在確認用（内部的には同じハンドラーを使用）
	})

	return r
}
