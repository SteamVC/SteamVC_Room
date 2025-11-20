package repo

import (
	"context"

	"github.com/SteamVC/SteamVC_Room/backend/api-server/internal/models"
)

type RoomRepo interface {
	CreateRoom(ctx context.Context, room models.Room, ttlSec int) error
	GetRoom(ctx context.Context, roomId string) (models.Room, bool, error)
	DeleteRoom(ctx context.Context, roomId string) error

	AddUser(ctx context.Context, roomId string, user models.User, ttlSec int) error
	RemoveUser(ctx context.Context, roomId, userId string) error
	ListUser(ctx context.Context, roomId string) ([]models.User, error)
	UpdateUserMute(ctx context.Context, roomId, userId string, isMuted bool) error

	TouchRoom(ctx context.Context, roomId string, ttlSec int) error
	ExistsRoom(ctx context.Context, roomId string) (bool, error)
}
