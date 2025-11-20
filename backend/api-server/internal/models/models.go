// Package models はアプリケーションで使用するデータ構造を定義します
package models

// User はルームに参加するユーザーの情報を表します
type User struct {
	UserId    string `json:"userId"`              // ユーザーの一意な識別子
	UserName  string `json:"userName"`            // ユーザー名（表示用）
	UserImage string `json:"userImage,omitempty"` // ユーザーのアイコン画像URL（オプショナル）
	IsMuted   bool   `json:"isMuted"`             // ミュート状態（true: ミュート中、false: ミュート解除）
}

// Room はボイスチャットルームの情報を表します
type Room struct {
	RoomId    string `json:"roomId"`    // ルームの一意な識別子
	OwnerId   string `json:"ownerId"`   // ルームのオーナー（作成者）のユーザーID
	CreatedAt int64  `json:"createdAt"` // ルーム作成日時（Unixタイムスタンプ）
}
