'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Device, types } from 'mediasoup-client';
import { Room } from '@/app/room/Room';

type RtpCapabilities = types.RtpCapabilities;
type Transport = types.Transport;
type Producer = types.Producer;
type MediaKind = types.MediaKind;
type RtpParameters = types.RtpParameters;

interface Participant {
  id: string;
  name: string;
  audioEnabled: boolean;
}

interface SocketResponse {
  error?: string;
  rtpCapabilities?: RtpCapabilities;
  id?: string;
  iceParameters?: unknown;
  iceCandidates?: unknown;
  dtlsParameters?: unknown;
  producerId?: string;
  kind?: MediaKind;
  rtpParameters?: RtpParameters;
  success?: boolean;
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const producerTransportRef = useRef<Transport | null>(null);
  const consumerTransportRef = useRef<Transport | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);

  const connectToRoom = async () => {
    const socket = io('http://localhost:3000');
    socketRef.current = socket;

    socket.on('connect', async () => {
      console.log('Connected to SFU server');

      // ルームに参加
      socket.emit('join-room', { roomId, userId: socket.id }, async (response: SocketResponse) => {
        console.log('Joined room, RTP capabilities:', response.rtpCapabilities);

        if (!response.rtpCapabilities) return;

        // Mediasoup Deviceを初期化
        const device = new Device();
        deviceRef.current = device;

        await device.load({ routerRtpCapabilities: response.rtpCapabilities });
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

  useEffect(() => {
    // Socket.IO接続
    connectToRoom();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const createTransport = async (direction: 'send' | 'recv'): Promise<Transport | null> => {
    return new Promise((resolve) => {
      socketRef.current?.emit('create-transport', { roomId, direction }, async (response: SocketResponse) => {
        if (response.error || !response.id) {
          console.error('Transport creation failed:', response.error || 'Missing transport id');
          resolve(null);
          return;
        }

        const transport = direction === 'send'
          ? deviceRef.current?.createSendTransport({
              id: response.id,
              iceParameters: response.iceParameters,
              iceCandidates: response.iceCandidates,
              dtlsParameters: response.dtlsParameters,
            } as any)
          : deviceRef.current?.createRecvTransport({
              id: response.id,
              iceParameters: response.iceParameters,
              iceCandidates: response.iceCandidates,
              dtlsParameters: response.dtlsParameters,
            } as any);

        if (!transport) {
          resolve(null);
          return;
        }

        transport.on('connect', (params: { dtlsParameters: unknown }, callback: () => void, errback: (error: Error) => void) => {
          socketRef.current?.emit('connect-transport', {
            transportId: transport.id,
            dtlsParameters: params.dtlsParameters
          }, (response: SocketResponse) => {
            if (response.error) {
              errback(new Error(response.error));
            } else {
              callback();
            }
          });
        });

        if (direction === 'send') {
          transport.on('produce', (params: { kind: string; rtpParameters: unknown }, callback: (params: { id: string }) => void, errback: (error: Error) => void) => {
            socketRef.current?.emit('produce', {
              transportId: transport.id,
              kind: params.kind,
              rtpParameters: params.rtpParameters
            }, (response: SocketResponse) => {
              if (response.error) {
                errback(new Error(response.error));
              } else if (response.id) {
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
      }, async (response: SocketResponse) => {
        if (response.error) {
          console.error('Consume failed:', response.error);
          return;
        }

        if (!response.id || !response.producerId || !response.kind || !response.rtpParameters) {
          console.error('Invalid consume response');
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

  const handleLeave = () => {
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    router.push('/');
  };

  return (
    <Room
      roomId={roomId}
      participants={participants}
      audioEnabled={audioEnabled}
      onToggleAudio={toggleAudio}
      onLeave={handleLeave}
    />
  );
}
