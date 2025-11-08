'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StartScreen } from '@/components/StartScreen';
import { Home } from '@/components/Home';
import { IDInputForm } from '@/components/IDInputForm';

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
      const response = await fetch('http://localhost:8080/api/rooms', {
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

  const handleRoomIdSubmit = (roomId: string) => {
    router.push(`/room/${roomId}?name=${encodeURIComponent(userName)}`);
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
