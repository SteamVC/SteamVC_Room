package models

type User struct {
	UserId    string `json:"userId"`
	UserName  string `json:"userName"`
	UserImage string `json:"userImage,omitempty"`
	IsMuted   bool   `json:"isMuted"`
}

type Room struct {
	RoomId    string `json:"roomId"`
	OwnerId   string `json:"ownerId"`
	CreatedAt int64  `json:"createdAt"`
}
