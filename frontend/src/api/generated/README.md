# API クライアント使用例

このディレクトリには、Protocol Buffers と Swagger から Orval によって自動生成された API クライアントコードが含まれています。

## 生成されたファイル

- `room-service/` - Room サービスの API クライアント関数
- `models/` - TypeScript の型定義

## 使用例

### 1. Room の作成

```typescript
import { getRoomService } from '@/api/generated/room-service/room-service';

const roomService = getRoomService();

async function createRoom() {
  try {
    const response = await roomService.roomServiceCreateRoom({
      userName: 'John Doe',
      userId: 'user123',
    });

    console.log('Room created:', response);
  } catch (error) {
    console.error('Failed to create room:', error);
  }
}
```

### 2. Room の取得

```typescript
import { getRoomService } from '@/api/generated/room-service/room-service';

const roomService = getRoomService();

async function getRoom(roomId: string) {
  try {
    const response = await roomService.roomServiceGetRoom(roomId);

    console.log('Room data:', response.room);
    console.log('Users:', response.room?.users);
  } catch (error) {
    console.error('Failed to get room:', error);
  }
}
```

### 3. Room の削除

```typescript
import { getRoomService } from '@/api/generated/room-service/room-service';

const roomService = getRoomService();

async function deleteRoom(roomId: string) {
  try {
    const response = await roomService.roomServiceDeleteRoom(roomId);

    if (response.success) {
      console.log('Room deleted successfully:', response.message);
    }
  } catch (error) {
    console.error('Failed to delete room:', error);
  }
}
```

### 4. React コンポーネントでの使用例

```typescript
'use client';

import { useState, useEffect } from 'react';
import { getRoomService } from '@/api/generated/room-service/room-service';
import type { V1Room } from '@/api/generated/models';

const roomService = getRoomService();

export default function RoomComponent({ roomId }: { roomId: string }) {
  const [room, setRoom] = useState<V1Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchRoom = async () => {
      try {
        setLoading(true);
        const response = await roomService.roomServiceGetRoom(roomId);
        setRoom(response.room || null);
      } catch (err) {
        setError('Failed to fetch room');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchRoom();
  }, [roomId]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!room) return <div>Room not found</div>;

  return (
    <div>
      <h1>Room: {room.roomId}</h1>
      <h2>Users:</h2>
      <ul>
        {room.users?.map((user) => (
          <li key={user.userId}>
            <img src={user.userImage} alt={user.userName} />
            {user.userName}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

## 型定義

生成された型定義は `models/` ディレクトリにあります:

- `V1Room` - Room の型
- `V1User` - User の型
- `V1CreateRoomRequest` - Room 作成リクエストの型
- `V1GetRoomResponse` - Room 取得レスポンスの型
- `V1StandardResponse` - 標準レスポンスの型

## API の再生成

Protocol Buffers の定義を変更した場合、以下のコマンドを実行してコードを再生成してください:

```bash
# 1. バックエンド: Protocol Buffers から Swagger を生成
cd backend
protoc -I api/proto \
  --go_out api/pb --go_opt paths=source_relative \
  --go-grpc_out api/pb --go-grpc_opt paths=source_relative \
  --grpc-gateway_out api/pb --grpc-gateway_opt paths=source_relative \
  --openapiv2_out api/docs \
  api/proto/room.proto

# 2. フロントエンド: Swagger から TypeScript クライアントを生成
cd ../frontend
npm run generate:api
```

## 環境変数

`frontend/src/api/axios-instance.ts` で API のベース URL を設定できます:

```env
NEXT_PUBLIC_API_URL=http://localhost:8080
```
