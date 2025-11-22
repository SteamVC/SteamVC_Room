package repo

import "context"

// VoiceRepo は録音データを保存/取得するためのインターフェース
type VoiceRepo interface {
	SaveVoice(ctx context.Context, roomId, userId string, data []byte, script string) error
	GetVoice(ctx context.Context, roomId, userId string) ([]byte, string, error)
}
