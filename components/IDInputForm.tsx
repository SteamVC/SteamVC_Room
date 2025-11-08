'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';

interface IDInputFormProps {
  onSubmit: (roomId: string) => void;
  onBack: () => void;
}

export function IDInputForm({ onSubmit, onBack }: IDInputFormProps) {
  const [roomId, setRoomId] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      onSubmit(roomId.trim());
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-400 to-purple-500 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            IDを入力してください
          </CardTitle>
          <CardDescription className="text-center">
            参加したいルームのIDを入力してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="ルームID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="text-lg"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={onBack}
                variant="outline"
                className="flex-1"
              >
                戻る
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={!roomId.trim()}
              >
                参加
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
