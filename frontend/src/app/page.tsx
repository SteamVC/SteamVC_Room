'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home } from '@/app/home/Home';
import { IDInputForm } from '@/app/form/IDInputForm';
import { getRoomService } from '@/api/generated/room-service/room-service';

type Screen = 'start' | 'home' | 'joinRoom';

export default function Page() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('start');
  const [userName, setUserName] = useState('');
  const router = useRouter();

  const handleNameSubmit = (name: string) => {
    setUserName(name);
    setCurrentScreen('home');
  };

  const roomService = getRoomService();

  const handleCreateRoom = async () => {
    try {
      // 生成されたAPIクライアントを使用
      const response = await roomService.roomServiceCreateRoom({
        userName: userName,
        userId: `user_${Date.now()}`, // 一時的なユーザーID
      });

      if (response.success && response.roomId) {
        // レスポンスからルームIDを取得してページ遷移
        console.log('Room created:', response);
        router.push(`/room/${response.roomId}?name=${encodeURIComponent(userName)}`);
      } else {
        alert('ルーム作成に失敗しました: ' + (response.message || '不明なエラー'));
      }
    } catch (error) {
      console.error('Room creation failed:', error);
      alert('ルーム作成に失敗しました');
    }
  };

  const handleJoinRoom = () => {
    setCurrentScreen('joinRoom');
  };

  const handleRoomIdSubmit = async (roomId: string) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/rooms/${roomId}`);

      if (!response.ok) {
        if (response.status === 404) {
          alert('指定されたルームが見つかりません');
        } else {
          alert('ルームの確認に失敗しました');
        }
        return;
      }

      router.push(`/room/${roomId}?name=${encodeURIComponent(userName)}`);
    } catch (error) {
      console.error('Room check failed:', error);
      alert('ルームの確認に失敗しました');
    }
  };

  const handleBack = () => {
    setCurrentScreen('home');
  };

  if (currentScreen === 'joinRoom') {
    return <IDInputForm onSubmit={handleRoomIdSubmit} onBack={handleBack} />;
  }

  return <Home onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
}
