# Protocol Buffers + Swagger + Orval セットアップガイド

このプロジェクトでは、Protocol Buffers を使用して Swagger ドキュメントを自動生成し、Orval でフロントエンドの型付き API クライアントを生成しています。

## アーキテクチャ

```
Protocol Buffers (.proto)
    ↓ (protoc)
    ├─ Go コード (api/pb/*.go)
    ├─ gRPC コード (api/pb/*_grpc.pb.go)
    ├─ gRPC Gateway (api/pb/*.pb.gw.go)
    └─ OpenAPI/Swagger (api/docs/*.swagger.json)
         ↓ (Orval)
         └─ TypeScript API クライアント (frontend/src/api/generated/)
```

## メリット

### 1. 単一の真実の源 (Single Source of Truth)

Protocol Buffers の定義ファイル (.proto) から、バックエンドとフロントエンドの両方のコードを生成。

### 2. 型の整合性

- バックエンド: Go の型安全なコード
- フロントエンド: TypeScript の型安全なコード
- API 定義の変更が自動的に両方に反映

### 3. 開発体験の向上

- 自動補完
- コンパイル時の型チェック
- API の変更を即座に検出

### 4. ドキュメントの自動生成

Swagger/OpenAPI 形式のドキュメントが自動生成されるため、手動でのドキュメント管理が不要。

## ディレクトリ構造

```
backend/
├── api/
│   ├── proto/              # Protocol Buffers 定義
│   │   ├── common.proto    # 共通の型定義
│   │   ├── room.proto      # Room サービスの定義
│   │   └── google/         # Google API の proto ファイル
│   ├── pb/                 # 生成された Go コード
│   │   ├── *.pb.go        # Protocol Buffers の Go コード
│   │   ├── *_grpc.pb.go   # gRPC サービスコード
│   │   └── *.pb.gw.go     # gRPC Gateway コード
│   └── docs/               # 生成された Swagger ドキュメント
│       └── room.swagger.json

frontend/
├── src/
│   └── api/
│       ├── axios-instance.ts     # Axios の設定
│       └── generated/            # Orval で生成されたコード
│           ├── room-service/     # API クライアント関数
│           └── models/           # TypeScript 型定義
└── orval.config.ts              # Orval の設定ファイル
```

## セットアップ手順

### 1. 必要なツールのインストール

#### protoc (Protocol Buffers コンパイラ)

```bash
# Windows (winget)
winget install protobuf

# macOS (Homebrew)
brew install protobuf

# Linux
apt-get install protobuf-compiler
```

#### Go プラグイン

```bash
# protoc-gen-go
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest

# protoc-gen-go-grpc
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# protoc-gen-grpc-gateway
go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway@latest

# protoc-gen-openapiv2
go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-openapiv2@latest
```

#### Orval

```bash
cd frontend
npm install -D orval @orval/core @orval/axios
```

### 2. Protocol Buffers の定義

`backend/api/proto/room.proto` の例:

```protobuf
syntax = "proto3";
package steamvc.room.v1;

import "common.proto";
import "google/api/annotations.proto";

service RoomService {
  rpc GetRoom(GetRoomRequest) returns (GetRoomResponse) {
    option (google.api.http) = {
      get: "/api/v1/room/{room_id}"
    };
  }

  rpc CreateRoom(CreateRoomRequest) returns (steamvc.common.v1.StandardResponse) {
    option (google.api.http) = {
      post: "/api/v1/room/create"
      body: "*"
    };
  }
}

message Room {
  string room_id = 1;
  repeated User users = 2;
}
```

### 3. コード生成

#### バックエンド (Protocol Buffers → Go + Swagger)

```bash
cd backend

# Windows の場合、PATH を設定
export PATH="$PATH:$USERPROFILE/AppData/Local/Microsoft/WinGet/Packages/Google.Protobuf_Microsoft.Winget.Source_8wekyb3d8bbwe/bin:$USERPROFILE/go/bin"

protoc -I api/proto \
  --go_out api/pb --go_opt paths=source_relative \
  --go-grpc_out api/pb --go-grpc_opt paths=source_relative \
  --grpc-gateway_out api/pb --grpc-gateway_opt paths=source_relative \
  --openapiv2_out api/docs \
  api/proto/room.proto
```

#### フロントエンド (Swagger → TypeScript)

```bash
cd frontend
npm run generate:api
```

## 開発ワークフロー

### API を追加・変更する場合

1. **Protocol Buffers の定義を編集**
   ```bash
   # backend/api/proto/room.proto を編集
   ```

2. **バックエンドのコードを生成**
   ```bash
   cd backend
   protoc -I api/proto \
     --go_out api/pb --go_opt paths=source_relative \
     --go-grpc_out api/pb --go-grpc_opt paths=source_relative \
     --grpc-gateway_out api/pb --grpc-gateway_opt paths=source_relative \
     --openapiv2_out api/docs \
     api/proto/room.proto
   ```

3. **フロントエンドのコードを生成**
   ```bash
   cd frontend
   npm run generate:api
   ```

4. **型チェック**

   TypeScript のコンパイラが自動的に型の整合性をチェックします。

## Orval の設定

`frontend/orval.config.ts`:

```typescript
import { defineConfig } from 'orval';

export default defineConfig({
  roomApi: {
    input: {
      target: '../backend/api/docs/room.swagger.json',
    },
    output: {
      mode: 'tags-split',
      target: './src/api/generated/room.ts',
      schemas: './src/api/generated/models',
      client: 'axios',
      override: {
        mutator: {
          path: './src/api/axios-instance.ts',
          name: 'customAxiosInstance',
        },
      },
    },
  },
});
```

## トラブルシューティング

### protoc が見つからない

```bash
# PATH を確認
echo $PATH

# protoc のバージョン確認
protoc --version
```

### Go プラグインが見つからない

```bash
# GOPATH/bin が PATH に含まれているか確認
echo $GOPATH/bin

# プラグインの存在確認
ls $GOPATH/bin | grep protoc-gen
```

### Orval の生成エラー

```bash
# Swagger ファイルが正しく生成されているか確認
cat backend/api/docs/room.swagger.json

# Orval の設定を確認
cat frontend/orval.config.ts
```

## 参考リンク

- [Protocol Buffers](https://protobuf.dev/)
- [gRPC Gateway](https://grpc-ecosystem.github.io/grpc-gateway/)
- [Orval](https://orval.dev/)
- [Google API Design Guide](https://cloud.google.com/apis/design)
