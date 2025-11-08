FROM node:20-alpine

WORKDIR /app

# Mediasoupのビルド依存関係
RUN apk add --no-cache python3 py3-pip make g++ gcc linux-headers

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000
EXPOSE 10000-10100/udp
EXPOSE 10000-10100/tcp

CMD ["npm", "start"]
