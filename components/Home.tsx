'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Search } from 'lucide-react';

interface HomeProps {
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

export function Home({ onCreateRoom, onJoinRoom }: HomeProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-purple-400 to-pink-500 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold text-center">
            Home
          </CardTitle>
          <CardDescription className="text-center">
            ルームを作成または参加してください
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={onCreateRoom}
            className="w-full h-20 text-lg bg-green-600 hover:bg-green-700"
          >
            <Plus className="mr-2 h-6 w-6" />
            部屋を作成
          </Button>
          <Button
            onClick={onJoinRoom}
            className="w-full h-20 text-lg bg-blue-600 hover:bg-blue-700"
          >
            <Search className="mr-2 h-6 w-6" />
            部屋を探す
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
