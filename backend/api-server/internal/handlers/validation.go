package handlers

import "fmt"

// validateUserId はユーザーIDのバリデーションを行います
// ユーザーIDが空の場合はエラーを返します
func validateUserId(userId string) error {
	if normalizeID(userId) == "" {
		return fmt.Errorf("userId required")
	}
	return nil
}

// validateRoomId はルームIDのバリデーションを行います
// ルームIDが空の場合はエラーを返します
func validateRoomId(roomId string) error {
	if normalizeID(roomId) == "" {
		return fmt.Errorf("roomId required")
	}
	return nil
}
