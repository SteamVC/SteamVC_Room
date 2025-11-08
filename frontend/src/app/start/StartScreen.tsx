'use client';

import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/src/components/ui/card';
import { ArrowRight } from 'lucide-react';

interface StartScreenProps {
  onNameSubmit: (name: string) => void;
}

export function StartScreen({ onNameSubmit }: StartScreenProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      onNameSubmit(name.trim());
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-green-400 to-blue-500 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">
            名前を入力してください
          </CardTitle>
          <CardDescription className="text-center">
            ボイスチャットルームに参加する前に名前を設定してください
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="text"
              placeholder="名前を入力"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-lg"
              autoFocus
            />
            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={!name.trim()}
            >
              次へ
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
