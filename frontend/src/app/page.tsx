'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StartScreen } from '@/app/start/StartScreen';
import { Home } from '@/app/home/Home';
import { IDInputForm } from '@/app/form/IDInputForm';

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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081';
      const response = await fetch(`${apiUrl}/api/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${userName}のルーム`, max_participants: 10 })
      });

      const data = await response.json();
      router.push(`/room/${data.id}?name=${encodeURIComponent(userName)}`);
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8081';
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

  if (currentScreen === 'start') {
    return <StartScreen onNameSubmit={handleNameSubmit} />;
  }

  if (currentScreen === 'joinRoom') {
    return <IDInputForm onSubmit={handleRoomIdSubmit} onBack={handleBack} />;
  }

  return <Home onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
}
