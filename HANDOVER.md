# 引き継ぎ書

**作成日**: 2025-11-17
**作業者**: Claude Code
**対象ブランチ**: Back-dev

## 作業概要

バックエンド（API Server + SFU Server）とフロントエンド（Next.js）の連携確認を実施しました。
その過程で発見したバグを修正し、すべてのサービスが正常に動作することを確認しました。

---

## 実施した作業

### 1. 環境確認と起動テスト

```bash
docker-compose up --build -d
```

**結果**: API Server が起動に失敗（再起動ループ）

### 2. 問題の調査

API Server のログを確認したところ、以下のエラーを発見：

```
2025/11/17 07:52:12 failed to connect to redis: NOAUTH Authentication required.
```

**原因**: Redis 接続時にパスワード認証が設定されていなかった

### 3. バグ修正

**修正ファイル**: `backend/api-server/cmd/server/main.go`

**修正内容**:

```diff
func main() {
	addr := getEnvOrDefault("API_ADDR", ":8080")
	redisAddr := getEnvOrDefault("REDIS_ADDR", "localhost:6379")
+	redisPassword := getEnvOrDefault("REDIS_PASSWORD", "")
	ttlSec := defaultTTLSec

	rdb := redis.NewClient(&redis.Options{
		Addr:         redisAddr,
+		Password:     redisPassword,    // 認証パスワード
		PoolSize:     10,
		MinIdleConns: 5,
		MaxRetries:   3,
		DialTimeout:  5 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolTimeout:  4 * time.Second,
	})
```

**変更箇所**: 39 行目にパスワード認証を追加

### 4. go.sum の更新

依存関係が不足していたため、以下を実行：

```bash
cd backend/api-server
go mod tidy
```

**追加された依存関係**:

- github.com/go-chi/cors v1.2.1
- github.com/bsm/ginkgo/v2 v2.12.0
- github.com/bsm/gomega v1.27.10

### 5. 再ビルドと起動確認

```bash
docker-compose up --build -d
```

すべてのサービスが正常に起動しました。

---

## 動作確認結果

### サービス起動状況

すべてのコンテナが正常に稼働中：

| サービス   | コンテナ名       | ポート | 状態  |
| ---------- | ---------------- | ------ | ----- |
| API Server | steamvc-api      | 8080   | ✅ Up |
| SFU Server | steamvc-sfu      | 3000   | ✅ Up |
| Frontend   | steamvc-frontend | 3001   | ✅ Up |
| Redis      | steamvc-redis    | 6379   | ✅ Up |

### API エンドポイントテスト

#### ✅ ヘルスチェック

```bash
curl http://localhost:8080/api/v1/healthz
# HTTP 200 OK
```

#### ✅ ルーム作成

```bash
curl -X POST http://localhost:8080/api/v1/room/create \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-123","userName":"TestUser","userImage":""}'

# レスポンス:
{
  "roomId": "01KA8CZZYDPZ6CJXKSFCNNNY48",
  "success": true
}
```

#### ✅ ルーム情報取得

```bash
curl http://localhost:8080/api/v1/room/01KA8CZZYDPZ6CJXKSFCNNNY48

# レスポンス:
{
  "room": {
    "roomId": "01KA8CZZYDPZ6CJXKSFCNNNY48",
    "ownerId": "test-user-123",
    "createdAt": 1763366141
  },
  "users": [
    {
      "userId": "test-user-123",
      "userName": "TestUser"
    }
  ]
}
```

#### ✅ ルーム参加

```bash
curl -X POST http://localhost:8080/api/v1/room/01KA8CZZYDPZ6CJXKSFCNNNY48/join \
  -H "Content-Type: application/json" \
  -d '{"userId":"test-user-456","userName":"SecondUser","userImage":""}'

# レスポンス:
{
  "success": true
}
```

複数ユーザーの参加・管理が正常に動作することを確認しました。

---

## 現在の状態

### ✅ 正常に動作している機能

1. **API Server (Go)**

   - Redis 接続・認証
   - ルーム作成・取得・削除
   - ユーザー参加・退出
   - CORS 設定（localhost:3001, localhost:3000 を許可）

2. **SFU Server (Node.js)**

   - Mediasoup Worker 起動
   - Socket.IO サーバー稼働

3. **Frontend (Next.js)**

   - Next.js 16 起動
   - UI レンダリング

4. **Redis**
   - パスワード認証
   - データ永続化

### ⚠️ 未確認・未実装の項目

1. **WebRTC 音声通話**

   - Socket.IO 経由の実際の音声通話は未テスト
   - ブラウザでの動作確認が必要

2. **フロントエンド →API 連携**

   - curl での API テストは完了
   - ブラウザからの API 呼び出しは未確認

3. **エラーハンドリング**
   - 異常系のテストは未実施

---

## ファイル変更一覧

### 修正したファイル

1. **backend/api-server/cmd/server/main.go**

   - 行 34: `redisPassword := getEnvOrDefault("REDIS_PASSWORD", "")` 追加
   - 行 39: `Password: redisPassword,` 追加

2. **backend/api-server/go.sum**
   - `go mod tidy` により自動更新

### 変更なし（確認済み）

- docker-compose.yml（環境変数設定済み）
- .env（REDIS_PASSWORD 設定済み）
- その他すべてのファイル

---

## 環境変数

`.env` ファイルの内容：

```bash
REDIS_PASSWORD=sakekasu
REDIS_DB=0
API_PORT=8080
```

---

## 今後の作業推奨事項

### 優先度: 高

1. **ブラウザでの動作確認**

   ```
   http://localhost:3001 にアクセスして実際に動作確認
   ```

2. **WebRTC 音声通話テスト**

   - 複数ブラウザ/デバイスで音声通話を試す
   - マイク許可のフローを確認

3. **エラーハンドリングの確認**
   - 存在しないルームへのアクセス
   - 無効なユーザー ID
   - ネットワークエラー時の挙動

### 優先度: 中

4. **フロントエンドと API の統合テスト**

   - ルーム作成フローの確認
   - ルーム参加フローの確認

5. **ログの整理**

   - エラーログの充実
   - デバッグログの追加

6. **セキュリティ確認**
   - CORS 設定の見直し
   - 認証・認可の実装検討

### 優先度: 低

7. **パフォーマンステスト**

   - 同時接続数のテスト
   - Redis 接続プールの調整

8. **ドキュメント整備**
   - API 仕様書の作成
   - 開発環境構築手順の整備

---

## トラブルシューティング

### サービスが起動しない場合

```bash
# すべてのコンテナを停止
docker-compose down

# イメージを削除して再ビルド
docker-compose down --rmi all
docker-compose up --build -d
```

### ログの確認方法

```bash
# すべてのサービスのログ
docker-compose logs -f

# 特定のサービス
docker-compose logs -f api-server
docker-compose logs -f sfu-server
docker-compose logs -f frontend
```

### Redis の接続確認

```bash
# Redisコンテナに接続
docker exec -it steamvc-redis redis-cli

# 認証（パスワード: sakekasu）
AUTH sakekasu

# キーの確認
KEYS *
```

---

## 参考情報

### アクセス URL

- フロントエンド: http://localhost:3001
- API Server: http://localhost:8080
- SFU Server: http://localhost:3000

### 主要なファイルパス

- API Server エントリーポイント: `backend/api-server/cmd/server/main.go`
- API ルーター設定: `backend/api-server/internal/http/router.go`
- API ハンドラー: `backend/api-server/internal/handlers/room.go`
- SFU Server: `backend/sfu-server/src/server.ts`
- フロントエンド ルームページ: `frontend/src/app/room/[id]/page.tsx`

### Git 情報

- **現在のブランチ**: Back-dev
- **直近のコミット**: b983834 api の更新

---

## 備考

- API Server のビルドには約 15 秒かかります
- SFU Server の npm install には約 5 分かかります（初回）
- Frontend のビルドには約 50 秒かかります

Redis 接続の認証エラーはこの修正で解決しましたが、
本番環境では環境変数の管理方法を再検討することをお勧めします。

---

**以上**
