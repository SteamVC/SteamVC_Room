'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Device } from 'mediasoup-client';
import { RtpCapabilities, Transport } from 'mediasoup-client/lib/types';

interface Participant {
  id: string;
  name: string;
  audioEnabled: boolean;
}

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [roomInfo, setRoomInfo] = useState<any>(null);

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const producerTransportRef = useRef<Transport | null>(null);
  const consumerTransportRef = useRef<Transport | null>(null);
  const audioProducerRef = useRef<any>(null);

  useEffect(() => {
    // ルーム情報取得
    fetchRoomInfo();

    // Socket.IO接続
    connectToRoom();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, [roomId]);

  const fetchRoomInfo = async () => {
    try {
      const response = await fetch(`http://localhost:8080/api/rooms/${roomId}`);
      const data = await response.json();
      setRoomInfo(data);
    } catch (error) {
      console.error('Failed to fetch room info:', error);
    }
  };

  const connectToRoom = async () => {
    const socket = io('http://localhost:3000');
    socketRef.current = socket;

    socket.on('connect', async () => {
      console.log('Connected to SFU server');

      // ルームに参加
      socket.emit('join-room', { roomId, userId: socket.id }, async (response: any) => {
        console.log('Joined room, RTP capabilities:', response.rtpCapabilities);

        // Mediasoup Deviceを初期化
        const device = new Device();
        deviceRef.current = device;

        await device.load({ routerRtpCapabilities: response.rtpCapabilities as RtpCapabilities });
        console.log('Device loaded');

        setIsConnected(true);
      });
    });

    socket.on('new-producer', ({ producerId }) => {
      console.log('New producer:', producerId);
      // 新しいプロデューサーが参加したら消費を開始
      consume(producerId);
    });

    socket.on('consumer-closed', ({ consumerId }) => {
      console.log('Consumer closed:', consumerId);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected from SFU server');
      setIsConnected(false);
    });
  };

  const createTransport = async (direction: 'send' | 'recv'): Promise<Transport | null> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('create-transport', { roomId, direction }, async (response: any) => {
        if (response.error) {
          console.error('Transport creation failed:', response.error);
          resolve(null);
          return;
        }

        const transport = direction === 'send'
          ? deviceRef.current?.createSendTransport(response)
          : deviceRef.current?.createRecvTransport(response);

        if (!transport) {
          resolve(null);
          return;
        }

        transport.on('connect', ({ dtlsParameters }, callback, errback) => {
          socketRef.current?.emit('connect-transport', {
            transportId: transport.id,
            dtlsParameters
          }, (response: any) => {
            if (response.error) {
              errback(new Error(response.error));
            } else {
              callback();
            }
          });
        });

        if (direction === 'send') {
          transport.on('produce', ({ kind, rtpParameters }, callback, errback) => {
            socketRef.current?.emit('produce', {
              transportId: transport.id,
              kind,
              rtpParameters
            }, (response: any) => {
              if (response.error) {
                errback(new Error(response.error));
              } else {
                callback({ id: response.id });
              }
            });
          });
        }

        resolve(transport);
      });
    });
  };

  const startAudio = async () => {
    if (!deviceRef.current) {
      console.error('Device not initialized');
      return;
    }

    try {
      // マイク音声取得
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioTrack = stream.getAudioTracks()[0];

      // Producerトランスポート作成
      if (!producerTransportRef.current) {
        const transport = await createTransport('send');
        if (!transport) return;
        producerTransportRef.current = transport;
      }

      // 音声をプロデュース
      const producer = await producerTransportRef.current.produce({ track: audioTrack });
      audioProducerRef.current = producer;

      console.log('Audio producer created:', producer.id);
      setAudioEnabled(true);

    } catch (error) {
      console.error('Failed to start audio:', error);
      alert('マイクへのアクセスが拒否されました');
    }
  };

  const stopAudio = () => {
    if (audioProducerRef.current) {
      audioProducerRef.current.close();
      audioProducerRef.current = null;
    }
    setAudioEnabled(false);
  };

  const consume = async (producerId: string) => {
    if (!deviceRef.current) return;

    try {
      // Consumerトランスポート作成
      if (!consumerTransportRef.current) {
        const transport = await createTransport('recv');
        if (!transport) return;
        consumerTransportRef.current = transport;
      }

      socketRef.current?.emit('consume', {
        transportId: consumerTransportRef.current.id,
        producerId,
        rtpCapabilities: deviceRef.current.rtpCapabilities
      }, async (response: any) => {
        if (response.error) {
          console.error('Consume failed:', response.error);
          return;
        }

        const consumer = await consumerTransportRef.current!.consume({
          id: response.id,
          producerId: response.producerId,
          kind: response.kind,
          rtpParameters: response.rtpParameters
        });

        // 音声再生
        const audio = new Audio();
        audio.srcObject = new MediaStream([consumer.track]);
        audio.play();

        console.log('Audio consumer created:', consumer.id);
      });
    } catch (error) {
      console.error('Consume error:', error);
    }
  };

  const toggleAudio = () => {
    if (audioEnabled) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 to-purple-600 p-8">
      <div className="max-w-4xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-800">
                {roomInfo?.name || 'ルーム'}
              </h1>
              <p className="text-gray-600">ルームID: {roomId}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className={`px-4 py-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}>
                <span className="text-white font-semibold">
                  {isConnected ? '接続中' : '未接続'}
                </span>
              </div>
              <div className="text-gray-600">
                参加者: {roomInfo?.participants || 0}
              </div>
            </div>
          </div>
        </div>

        {/* 参加者リスト */}
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">参加者</h2>
          {participants.length === 0 ? (
            <p className="text-gray-500 text-center py-8">参加者がいません</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {participants.map((participant) => (
                <div
                  key={participant.id}
                  className="bg-gray-100 rounded-lg p-4 flex items-center gap-3"
                >
                  <div className={`w-3 h-3 rounded-full ${participant.audioEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="font-medium text-gray-700">{participant.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* コントロール */}
        <div className="bg-white rounded-2xl shadow-2xl p-6">
          <div className="flex justify-center gap-4">
            <button
              onClick={toggleAudio}
              disabled={!isConnected}
              className={`px-8 py-4 rounded-full font-semibold text-white transition-all transform hover:scale-105 ${
                audioEnabled
                  ? 'bg-red-500 hover:bg-red-600'
                  : 'bg-green-500 hover:bg-green-600'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {audioEnabled ? 'マイクOFF' : 'マイクON'}
            </button>
            <button
              onClick={() => window.location.href = '/'}
              className="px-8 py-4 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-full transition-all transform hover:scale-105"
            >
              退出
            </button>
          </div>
        </div>

        {/* 説明 */}
        <div className="mt-6 bg-white bg-opacity-20 backdrop-blur-sm rounded-2xl p-6 text-white">
          <h3 className="text-xl font-bold mb-2">使い方</h3>
          <ol className="list-decimal list-inside space-y-2">
            <li>「マイクON」ボタンを押して音声配信を開始</li>
            <li>他の参加者の音声が自動的に聞こえます</li>
            <li>音声はAIによって変換されます（実装予定）</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
