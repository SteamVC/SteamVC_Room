'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [roomName, setRoomName] = useState('');
  const [roomId, setRoomId] = useState('');
  const router = useRouter();

  const createRoom = async () => {
    if (!roomName) return;

    try {
      const response = await fetch('http://localhost:8080/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName, max_participants: 10 })
      });

      const data = await response.json();
      router.push(`/room/${data.id}`);
    } catch (error) {
      console.error('Room creation failed:', error);
      alert('ルーム作成に失敗しました');
    }
  };

  const joinRoom = () => {
    if (!roomId) return;
    router.push(`/room/${roomId}`);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
      <main className="w-full max-w-md p-8 bg-white rounded-2xl shadow-2xl">
        <h1 className="text-4xl font-bold text-center mb-8 text-gray-800">
          SteamVC Room
        </h1>
        <p className="text-center text-gray-600 mb-8">
          声質がシャッフルされるボイスチャットルーム
        </p>

        <div className="space-y-6">
          {/* ルーム作成 */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-700">ルーム作成</h2>
            <input
              type="text"
              placeholder="ルーム名を入力"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={createRoom}
              className="w-full px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
            >
              ルームを作成
            </button>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1 border-t border-gray-300"></div>
            <span className="text-gray-500 font-medium">または</span>
            <div className="flex-1 border-t border-gray-300"></div>
          </div>

          {/* ルーム参加 */}
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-700">ルーム参加</h2>
            <input
              type="text"
              placeholder="ルームIDを入力"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-500"
            />
            <button
              onClick={joinRoom}
              className="w-full px-6 py-3 bg-pink-600 text-white font-semibold rounded-lg hover:bg-pink-700 transition-colors"
            >
              ルームに参加
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
