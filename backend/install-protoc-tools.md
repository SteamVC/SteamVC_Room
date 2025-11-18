# Protocol Buffers ツールのインストール手順

## 1. protoc (Protocol Buffers コンパイラ) のインストール

Windows の場合、以下のいずれかの方法でインストールできます:

### 方法 A: Chocolatey を使用 (推奨)
```bash
choco install protoc
```

### 方法 B: 手動インストール
1. https://github.com/protocolbuffers/protobuf/releases から最新の protoc-XX.X-win64.zip をダウンロード
2. 解凍して bin/protoc.exe を PATH に追加

### 方法 C: winget を使用
```bash
winget install protobuf
```

## 2. Go プラグインのインストール

```bash
# protoc-gen-go (Protocol Buffers の Go コード生成)
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest

# protoc-gen-go-grpc (gRPC の Go コード生成)
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

# protoc-gen-grpc-gateway (gRPC-Gateway の生成)
go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-grpc-gateway@latest

# protoc-gen-openapiv2 (OpenAPI/Swagger ドキュメント生成)
go install github.com/grpc-ecosystem/grpc-gateway/v2/protoc-gen-openapiv2@latest
```

## 3. PATH の確認

Go のバイナリがインストールされるディレクトリが PATH に含まれていることを確認:
```bash
echo $GOPATH/bin  # または Windows の場合 %USERPROFILE%\go\bin
```

## 4. インストール確認

```bash
protoc --version
protoc-gen-go --version
protoc-gen-go-grpc --version
protoc-gen-grpc-gateway --version
protoc-gen-openapiv2 --version
```

## 5. protoc コマンドの実行

すべてのツールがインストールされたら、以下のコマンドを実行:

```bash
cd backend
protoc -I api/proto \
  --go_out api/pb --go_opt paths=source_relative \
  --go-grpc_out api/pb --go-grpc_opt paths=source_relative \
  --grpc-gateway_out api/pb --grpc-gateway_opt paths=source_relative \
  --openapiv2_out api/docs \
  api/proto/room.proto
```
### swaggerの起動方法

フルパスは自分で設定

docker run -d -p 8080:8080 `
  -e SWAGGER_JSON=/usr/share/nginx/html/swagger/room.swagger.json `
  -v ${PWD}/backend/api/docs:/usr/share/nginx/html/swagger `
  swaggerapi/swagger-ui

### orvalのインストール
openapi-generator-cli generate -i backend/api/docs/room.swagger.json -g typescript-axios -o frontend/src/api/generated