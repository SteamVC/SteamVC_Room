package service

import "errors"

// カスタムエラー定義
var (
	ErrRoomNotFound           = errors.New("room not found")
	ErrNotRoomOwner           = errors.New("forbidden: not room owner")
	ErrRoomAlreadyExists      = errors.New("room already exists")
	ErrRoomIDGenerationFailed = errors.New("failed to generate unique room ID after multiple attempts")
	ErrUserNotFound           = errors.New("user not found")
)
