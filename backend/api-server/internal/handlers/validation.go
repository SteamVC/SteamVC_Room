package handlers

import "fmt"

func validateUserId(userId string) error {
	if normalizeID(userId) == "" {
		return fmt.Errorf("userId required")
	}
	return nil
}

func validateRoomId(roomId string) error {
	if normalizeID(roomId) == "" {
		return fmt.Errorf("roomId required")
	}
	return nil
}
