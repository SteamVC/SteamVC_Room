'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home } from '@/app/home/Home';
import { IDInputForm } from '@/app/form/IDInputForm';
import { RoomServiceApi, Configuration } from '@/api/generated';

type Screen = 'start' | 'home' | 'joinRoom';

export default function Page() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('start');
  const [userName, setUserName] = useState('');
  const router = useRouter();

  const handleNameSubmit = (name: string) => {
    setUserName(name);
    setCurrentScreen('home');
  };

  const handleCreateRoom = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const config = new Configuration({ basePath: apiUrl });
      const roomService = new RoomServiceApi(config);

      // 生成されたAPIクライアントを使用
      const response = await roomService.roomServiceCreateRoom({
        userName: userName,
        userId: `user_${Date.now()}`, // 一時的なユーザーID
      });

      if (response.data.success && response.data.roomId) {
        // レスポンスからルームIDを取得してページ遷移
        console.log('Room created:', response.data);
        router.push(`/room/${response.data.roomId}?name=${encodeURIComponent(userName)}`);
      } else {
        alert('ルーム作成に失敗しました');
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
      const config = new Configuration({ basePath: apiUrl });
      const roomService = new RoomServiceApi(config);

      const response = await roomService.roomServiceGetRoom(roomId);

      if (response.data.room) {
        router.push(`/room/${roomId}?name=${encodeURIComponent(userName)}`);
      } else {
        alert('指定されたルームが見つかりません');
      }
    } catch (error) {
      console.error('Room check failed:', error);
      alert('指定されたルームが見つかりません');
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
