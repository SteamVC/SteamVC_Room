package main

import (
	"encoding/json"
	"net/http"
)

type CreateRoomRequest struct {
	UserName string `json:"userName"`
	UserID   string `json:"userId"`
}

type CreateRoomResponse struct {
	Success bool   `json:"success"`
	Message string `json:"message"`
}

type ErrorResponse struct {
	Code    int      `json:"code"`
	Message string   `json:"message"`
	Details []string `json:"details"`
}

type RoomInfo struct {
	RoomID string `json:"roomId"`
}
type UserInfo struct {
	UserName  string `json:"userName"`
	UserID    string `json:"userId"`
	UserImage string `json:"userImage"`
}
type GetRoomResponse struct {
	Room  RoomInfo   `json:"room"`
	Users []UserInfo `json:"users"`
}

func createRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(ErrorResponse{
			Code:    0,
			Message: "Method not allowed",
			Details: []string{},
		})
		return
	}

	var req CreateRoomRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{
			Code:    0,
			Message: "Invalid request body",
			Details: []string{err.Error()},
		})
		return
	}

	// ここでルーム作成処理（DB保存など）を実装
	// 今回はダミーで成功レスポンスのみ返す
	resp := CreateRoomResponse{
		Success: true,
		Message: "Room created successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func deleteRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(ErrorResponse{
			Code:    0,
			Message: "Method not allowed",
			Details: []string{},
		})
		return
	}

	// パスからroomIdを取得
	// 例: /api/v1/room/delete/{roomId}
	roomId := ""
	path := r.URL.Path
	prefix := "/api/v1/room/delete/"
	if len(path) > len(prefix) {
		roomId = path[len(prefix):]
	}
	if roomId == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{
			Code:    0,
			Message: "Missing roomId",
			Details: []string{"roomId is required in path"},
		})
		return
	}

	// ここでルーム削除処理（DB削除など）を実装
	// 今回はダミーで成功レスポンスのみ返す
	resp := CreateRoomResponse{
		Success: true,
		Message: "Room deleted successfully",
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func getRoomHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		json.NewEncoder(w).Encode(ErrorResponse{
			Code:    0,
			Message: "Method not allowed",
			Details: []string{},
		})
		return
	}

	// パスからroomIdを取得
	// 例: /api/v1/room/{roomId}
	roomId := ""
	path := r.URL.Path
	prefix := "/api/v1/room/"
	if len(path) > len(prefix) {
		roomId = path[len(prefix):]
	}
	if roomId == "" {
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{
			Code:    0,
			Message: "Missing roomId",
			Details: []string{"roomId is required in path"},
		})
		return
	}

	// ここでDB等からルーム情報・ユーザー一覧を取得
	// 今回はダミーで返す
	resp := GetRoomResponse{
		Room: RoomInfo{RoomID: roomId},
		Users: []UserInfo{
			{UserName: "Taro", UserID: "u1", UserImage: "img1.png"},
			{UserName: "Jiro", UserID: "u2", UserImage: "img2.png"},
		},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/api/v1/room/create", createRoomHandler)
	http.HandleFunc("/api/v1/room/delete/", deleteRoomHandler)
	http.HandleFunc("/api/v1/room/", getRoomHandler)
	http.ListenAndServe(":8080", nil)
}