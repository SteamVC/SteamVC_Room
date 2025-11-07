# SteamVC Room セットアップガイド

## 概要

声質がシャッフルされるボイスチャットルームのWebサービスです。

## システム要件

- Docker & Docker Compose
- Node.js 18+ (ローカル開発時)
- Go 1.21+ (ローカル開発時)
- Redis (Dockerで自動起動)

## プロジェクト構造

```
SteamVC_Room/
├── backend/
│   ├── api-server/        # Go API Server (ルーム管理、Redis)
│   └── sfu-server/        # Node.js SFU Server (Mediasoup)
├── app/                   # Next.js フロントエンド
├── docker/
└── docker-compose.yml
```

## セットアップ手順

### 1. Dockerを使った起動（推奨）

```bash
# 環境変数設定
cp .env.example .env

# Dockerコンテナをビルド・起動
docker-compose up --build

# バックグラウンド起動
docker-compose up -d
```

サービスURL:
- フロントエンド: http://localhost:3001
- API Server: http://localhost:8080
- SFU Server: http://localhost:3000
- Redis: localhost:6379

### 2. ローカル開発

#### 2.1 Redisの起動

```bash
# Dockerでredisのみ起動
docker run -d -p 6379:6379 redis:7-alpine
```

#### 2.2 Go API Serverの起動

```bash
cd backend/api-server

# 依存関係のインストール
go mod download

# 起動
go run main.go
```

#### 2.3 Node.js SFU Serverの起動

```bash
cd backend/sfu-server

# 依存関係のインストール
npm install

# 開発モード起動
npm run dev
```

#### 2.4 フロントエンドの起動

```bash
# ルートディレクトリで

# 依存関係のインストール
npm install

# 開発モード起動
npm run dev
```

フロントエンド: http://localhost:3000

## 使い方

### ルームの作成

1. トップページでルーム名を入力
2. 「ルームを作成」をクリック
3. 生成されたルームIDをメモ

### ルームへの参加

1. トップページでルームIDを入力
2. 「ルームに参加」をクリック
3. ルームページで「マイクON」を押して音声配信開始

## アーキテクチャ

### 通信フロー

```
フロントエンド (React)
    ↓ HTTP
API Server (Go) ← → Redis
    ↓ HTTP通知
SFU Server (Mediasoup)
    ↓ WebSocket + WebRTC
フロントエンド (音声ストリーム)
```

### 技術スタック

- **フロントエンド**: Next.js 16, React 19, TypeScript, TailwindCSS
- **API Server**: Go, Gin, Redis, WebSocket
- **SFU Server**: Node.js, Mediasoup, Socket.IO
- **通信**: WebRTC (音声), WebSocket (シグナリング), HTTP (REST API)
- **インフラ**: Docker, Redis

## API エンドポイント

### Go API Server (port 8080)

- `POST /api/rooms` - ルーム作成
- `GET /api/rooms/:id` - ルーム情報取得
- `GET /api/rooms` - ルーム一覧取得
- `POST /api/rooms/:id/join` - ルーム参加
- `POST /api/rooms/:id/leave` - ルーム退出
- `GET /ws/:room_id` - WebSocket接続

### SFU Server (port 3000)

Socket.IOイベント:
- `join-room` - ルーム参加
- `create-transport` - WebRTCトランスポート作成
- `connect-transport` - トランスポート接続
- `produce` - 音声配信開始
- `consume` - 音声受信開始
- `leave-room` - ルーム退出

## 今後の実装予定

### AIモデル統合

- [ ] Python音声変換サーバーの実装
- [ ] StreamVC または Seed-VC の統合
- [ ] SFU → AI Server → SFU のパイプライン構築
- [ ] リアルタイム音声変換処理

### 機能追加

- [ ] ユーザー認証
- [ ] 声質のランダムシャッフル機能
- [ ] ルーム設定（最大参加者数、パスワード）
- [ ] チャット機能
- [ ] 録音機能

## トラブルシューティング

### ポートが使用中のエラー

```bash
# 使用中のポートを確認
netstat -ano | findstr :8080
netstat -ano | findstr :3000

# Dockerコンテナを停止
docker-compose down
```

### マイクアクセスエラー

- ブラウザでマイクへのアクセスを許可してください
- HTTPSまたはlocalhostでアクセスしてください（WebRTC要件）

### WebRTC接続エラー

- `ANNOUNCED_IP`環境変数を正しいIPアドレスに設定
- ファイアウォールでUDPポート10000-10100を開放

## ライセンス

MIT
