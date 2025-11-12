'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, MicOff, Headphones, Users, X } from 'lucide-react';

interface RoomProps {
  roomId: string;
  participants: Array<{
    id: string;
    name?: string;
    image?: string;
  }>;
  audioEnabled: boolean;
  onToggleAudio: () => void;
  onLeave: () => void;
}

export function Room({
  roomId,
  participants = [],
  audioEnabled,
  onToggleAudio,
  onLeave
}: RoomProps) {
  const [showParticipantsList, setShowParticipantsList] = useState(false);

  // 参加者が4人未満の場合、空のスロットを追加
  const participantSlots = [...participants];
  while (participantSlots.length < 4) {
    participantSlots.push({ id: `empty-${participantSlots.length}`, name: undefined });
  }

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-blue-500 to-purple-600">
      {/* ヘッダー */}
      <div className="bg-green-600 px-6 py-4 border-b-4 border-green-700">
        <div className="flex items-center justify-between">
          <div className="text-white">
            <h1 className="text-2xl font-bold">Room</h1>
            <p className="text-sm opacity-90">ID : {roomId}</p>
          </div>
          <Button
            onClick={onLeave}
            variant="destructive"
            size="icon"
            className="bg-red-500 hover:bg-red-600"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 参加者グリッド */}
      <div className="flex-1 p-6">
        <div className="h-full grid grid-cols-2 gap-4">
          {participantSlots.slice(0, 4).map((participant, index) => (
            <Card
              key={participant.id}
              className={`${
                participant.name
                  ? 'bg-gray-200'
                  : 'bg-gray-300 border-2 border-dashed border-gray-400'
              }`}
            >
              <CardContent className="flex items-center justify-center h-full p-0">
                {participant.name ? (
                  <div className="text-center">
                    <div className="w-24 h-24 bg-gray-400 rounded-lg mx-auto mb-2" />
                    <p className="text-gray-800 font-medium">ランダム画像</p>
                  </div>
                ) : (
                  <div className="text-center text-gray-500">
                    <div className="w-24 h-24 bg-gray-400 rounded-lg mx-auto mb-2" />
                    <p>ランダム画像</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* コントロールバー */}
      <div className="bg-green-600 px-6 py-4 border-t-4 border-green-700">
        <div className="flex items-center justify-between max-w-md mx-auto">
          <Button
            onClick={onToggleAudio}
            size="icon"
            className={`h-12 w-12 rounded-full ${
              audioEnabled
                ? 'bg-green-500 hover:bg-green-600'
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {audioEnabled ? (
              <Mic className="h-6 w-6" />
            ) : (
              <MicOff className="h-6 w-6" />
            )}
          </Button>

          <Button
            size="icon"
            className="h-12 w-12 rounded-full bg-green-500 hover:bg-green-600"
          >
            <Headphones className="h-6 w-6" />
          </Button>

          <Button
            size="icon"
            onClick={() => setShowParticipantsList(true)}
            className="h-12 w-12 rounded-full bg-green-500 hover:bg-green-600"
          >
            <Users className="h-6 w-6" />
          </Button>
        </div>
      </div>

      {/* 参加者リストモーダル */}
      {showParticipantsList && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowParticipantsList(false)}>
          <Card className="w-full max-w-md m-4" onClick={(e) => e.stopPropagation()}>
            <div className="bg-green-600 px-6 py-4 rounded-t-lg">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">参加者リスト ({participants.length}人)</h2>
                <Button
                  onClick={() => setShowParticipantsList(false)}
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-green-700"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>
            <CardContent className="p-6 max-h-96 overflow-y-auto">
              {participants.length === 0 ? (
                <p className="text-center text-gray-500">参加者がいません</p>
              ) : (
                <div className="space-y-3">
                  {participants.map((participant) => (
                    <div
                      key={participant.id}
                      className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg"
                    >
                      <div className="w-10 h-10 bg-gray-400 rounded-full flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-gray-800">
                          {participant.name || '名前なし'}
                        </p>
                        <p className="text-sm text-gray-500">ID: {participant.id.slice(0, 8)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
