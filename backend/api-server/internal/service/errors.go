package service

import "errors"

// カスタムエラー定義
var (
	ErrRoomNotFound     = errors.New("room not found")
	ErrNotRoomOwner     = errors.New("forbidden: not room owner")
	ErrRoomAlreadyExists = errors.New("room already exists")
)
