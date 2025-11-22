FROM node:22-alpine AS builder

WORKDIR /app

# Mediasoupのビルド依存関係、FFmpeg、node-vad用の依存関係
RUN apk add --no-cache python3 py3-pip make g++ gcc linux-headers ffmpeg

# package.json / package-lock.json をコピーして依存関係をインストール
COPY package*.json ./

# クリーンな状態で依存関係をインストール (devDependenciesも含む)
RUN npm cache clean --force && \
    npm ci --include=dev 2>&1 | tee /tmp/npm-install.log || \
    (sleep 1 && npm ci --include=dev)

# ソースコードをコピー
COPY . .

# TypeScriptをビルド
RUN npm run build

# 本番環境用の軽量イメージ
FROM node:22-alpine

WORKDIR /app

# 実行に必要な FFmpeg と依存関係（node-vad用にpython3/build-tools）を追加
RUN apk add --no-cache ffmpeg python3 py3-pip make g++ gcc linux-headers

# package.jsonをコピーして本番依存関係をインストール（コンテナ内でビルド）
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

# ビルド成果物をコピー
COPY --from=builder /app/dist ./dist

EXPOSE 3000
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

CMD ["npm", "start"]
