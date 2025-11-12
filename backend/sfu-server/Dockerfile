FROM node:22-alpine AS builder

WORKDIR /app

# Mediasoupのビルド依存関係を追加
RUN apk add --no-cache python3 py3-pip make g++ gcc linux-headers

# package.jsonのみをコピーして依存関係をインストール
COPY package*.json ./

# クリーンな状態で依存関係をインストール (devDependenciesも含む)
RUN rm -f package-lock.json && \
    npm cache clean --force && \
    npm install 2>&1 | tee /tmp/npm-install.log || \
    (sleep 1 && npm install)

# ソースコードをコピー
COPY . .

# TypeScriptをビルド
RUN npm run build

# 本番環境用の軽量イメージ
FROM node:22-alpine

WORKDIR /app

# 本番依存関係のみをコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

EXPOSE 3000
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

CMD ["npm", "start"]
