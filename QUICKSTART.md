# クイックスタートガイド

## 前提条件

- Docker & Docker Compose がインストール済み
- または Node.js 18+, Go 1.21+, Redis がインストール済み

## 最速起動（Docker推奨）

### 1. リポジトリをクローン

```bash
git clone <repository-url>
cd SteamVC_Room
```

### 2. 環境変数設定

```bash
cp .env.example .env
```

### 3. Docker Composeで起動

```bash
docker-compose up --build
```

### 4. ブラウザでアクセス

- **フロントエンド**: http://localhost:3001
- **API Server**: http://localhost:8080
- **SFU Server**: http://localhost:3000

## ローカル開発環境

### フロントエンドのみ起動

```bash
# 依存関係インストール
npm install

# 開発サーバー起動
npm run dev
```

http://localhost:3000 でアクセス

**注意**: バックエンドサーバーも起動する必要があります。

### Go API Server起動

```bash
cd backend/api-server

# Redisを起動（Dockerまたはローカル）
docker run -d -p 6379:6379 redis:7-alpine

# 依存関係インストール
go mod download

# 起動
go run main.go
```

http://localhost:8080 で起動

### Node.js SFU Server起動

```bash
cd backend/sfu-server

# 依存関係インストール
npm install

# 開発モード起動
npm run dev
```

http://localhost:3000 で起動

## 使い方

### 1. ルームを作成

1. トップページを開く
2. 「ルーム名を入力」に任意の名前を入力
3. 「ルームを作成」ボタンをクリック
4. 自動的にルームページに移動

### 2. ルームに参加

1. トップページで「ルームIDを入力」に既存のルームIDを入力
2. 「ルームに参加」ボタンをクリック
3. ルームページに移動

### 3. 音声通信を開始

1. ルームページで「マイクON」ボタンをクリック
2. ブラウザのマイク使用許可を承認
3. 他の参加者の音声が自動的に聞こえます
4. 「マイクOFF」で配信停止

## トラブルシューティング

### マイクアクセスエラー

- ブラウザでマイクへのアクセスを許可してください
- HTTPSまたは`localhost`でアクセスしてください（WebRTC要件）

### 音声が聞こえない

1. マイクの権限を確認
2. ブラウザのコンソールでエラーを確認
3. 他のタブで音声が再生されていないか確認

### Docker起動エラー

```bash
# コンテナを停止して再起動
docker-compose down
docker-compose up --build
```

### ポート競合エラー

以下のポートが使用されていないか確認:
- 3001 (フロントエンド)
- 8080 (API Server)
- 3000 (SFU Server)
- 6379 (Redis)
- 10000-10100 (WebRTC)

```bash
# Windowsでポート確認
netstat -ano | findstr :8080

# Linuxでポート確認
lsof -i :8080
```

## 次のステップ

- [SETUP.md](SETUP.md) - 詳細なセットアップガイド
- [README.md](README.md) - プロジェクト概要と技術スタック

## AIモデル統合（今後）

音声変換機能は今後実装予定です:
- StreamVC（低レイテンシ）
- Seed-VC（代替案）

現在は通常の音声通信のみ動作します。
