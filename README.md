# SteamVC Room

声質が参加者の中でシャッフルされるVCルームWebサービス。

## 機能

- ルーム作成・入室（ID検索）
- リアルタイム音声通信（WebRTC）
- 複数参加者対応（SFU方式）
- 音声変換機能（AI統合予定）

## 技術スタック

### フロントエンド
- **Next.js 16** + React 19 + TypeScript
- **TailwindCSS** - スタイリング
- **Socket.IO Client** - WebSocket通信
- **Mediasoup Client** - WebRTC音声配信

### バックエンド

#### API Server (Go)
- **Gin** - HTTPルーティング
- **Redis** - ルーム管理・状態保存
- **WebSocket** - リアルタイム通信
- **Docker** - コンテナ化

#### SFU Server (Node.js)
- **Mediasoup** - WebRTC SFU
- **Socket.IO** - シグナリング
- **Express** - HTTPサーバー

### 通信プロトコル
- **WebRTC** - 音声ストリーム伝送
- **WebSocket** - ルーム状態同期
- **HTTP** - REST API、サーバー間通知

### AIモデル（実装予定）
- **StreamVC** - 低レイテンシ音声変換（70ms目標）
- **Seed-VC** - 代替案（レイテンシ3000ms程度）

## クイックスタート

```bash
# Dockerで起動（推奨）
docker-compose up --build

# アクセス
# フロントエンド: http://localhost:3001
# API Server: http://localhost:8080
# SFU Server: http://localhost:3000
```

詳細なセットアップ手順は [SETUP.md](SETUP.md) を参照してください。

## プロジェクト構造

```
SteamVC_Room/
├── app/                    # Next.js フロントエンド
│   ├── page.tsx           # トップページ（ルーム作成・参加）
│   └── room/[id]/         # ルームページ
├── backend/
│   ├── api-server/        # Go API Server
│   │   ├── main.go        # ルーム管理、Redis連携
│   │   └── Dockerfile
│   └── sfu-server/        # Node.js SFU Server
│       ├── src/server.ts  # Mediasoup WebRTC
│       └── Dockerfile
├── docker-compose.yml      # Docker構成
└── SETUP.md               # 詳細セットアップガイド
```

## 実装状況

### 通信手段
===HTTP===
ルーム作成/削除/検索 
SFUServerへのルーム作成通知

===Websocket===
参加者の参加/退出管理 
参加者状態の更新 (マイクON/OFF、接続状態など) 
## ライセンス

MIT
