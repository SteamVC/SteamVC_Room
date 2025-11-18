import { useEffect, useRef, useCallback } from 'react';

interface WebSocketMessage {
  type: string;
  payload?: any;
}

interface UserLeftPayload {
  userId: string;
  userName?: string;
  userImage?: string;
}

interface UseRoomWebSocketOptions {
  roomId: string;
  userId: string;
  onUserLeft?: (payload: UserLeftPayload) => void;
  onError?: (error: string) => void;
}

export function useRoomWebSocket({
  roomId,
  userId,
  onUserLeft,
  onError
}: UseRoomWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isManualCloseRef = useRef(false);

  const connect = useCallback(() => {
    // 既存の接続がある場合はクローズ
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    const wsUrl = `ws://localhost:8080/api/v1/room/${roomId}/ws?userId=${encodeURIComponent(userId)}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected to API server');
      isManualCloseRef.current = false;
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'user_left':
            if (onUserLeft && message.payload) {
              onUserLeft(message.payload as UserLeftPayload);
            }
            break;
          case 'error':
            if (onError && message.payload?.message) {
              onError(message.payload.message);
            }
            break;
          case 'pong':
            // ping/pong応答
            break;
          default:
            console.log('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected from API server');
      wsRef.current = null;

      // 手動クローズでない場合は再接続を試みる
      if (!isManualCloseRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect WebSocket...');
          connect();
        }, 3000);
      }
    };

    wsRef.current = ws;
  }, [roomId, userId, onUserLeft, onError]);

  useEffect(() => {
    connect();

    // クリーンアップ
    return () => {
      isManualCloseRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // ユーザー退出を通知する関数
  const notifyLeave = useCallback((userName?: string, userImage?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message: WebSocketMessage = {
        type: 'leave',
        payload: {
          userId,
          userName,
          userImage
        }
      };
      wsRef.current.send(JSON.stringify(message));
    }
  }, [userId]);

  // ping送信（接続維持用）
  const sendPing = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }));
    }
  }, []);

  return {
    notifyLeave,
    sendPing,
    isConnected: wsRef.current?.readyState === WebSocket.OPEN
  };
}
