package config

import "os"

// VoiceConfig は録音関連設定（現状プレースホルダー）
type VoiceConfig struct {
	// 予約: 将来 S3 などに保存する際の設定をここに追加
}

func loadVoiceConfig() VoiceConfig {
	_ = os.Getenv // 今後の拡張用
	return VoiceConfig{}
}
