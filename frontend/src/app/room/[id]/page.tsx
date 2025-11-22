'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Device, types } from 'mediasoup-client';
import { Room } from '@/app/room/Room';
import { useRoomWebSocket } from '@/hooks/useRoomWebSocket';
import { RoomServiceApi, Configuration } from '@/api/generated';
import { API_URL, SFU_URL } from '@/lib/endpoints';

type RtpCapabilities = types.RtpCapabilities;
type Transport = types.Transport;
type Producer = types.Producer;
type Consumer = types.Consumer;
type MediaKind = types.MediaKind;
type RtpParameters = types.RtpParameters;

interface Participant {
  id: string;
  name: string;
  isMuted: boolean;
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
  const searchParams = useSearchParams();
  const roomId = params.id as string;
  const userName = searchParams.get('name') || '';

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [userId] = useState<string>(() => {
    if (typeof window === 'undefined') {
      return `user_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    }
    const key = `steamvc_user_${roomId}`;
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const fresh = `user_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    sessionStorage.setItem(key, fresh);
    return fresh;
  });

  const socketRef = useRef<Socket | null>(null);
  const deviceRef = useRef<Device | null>(null);
  const producerTransportRef = useRef<Transport | null>(null);
  const consumerTransportRef = useRef<Transport | null>(null);
  const audioProducerRef = useRef<Producer | null>(null);
  const mixedConsumerRef = useRef<Consumer | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const hasInitializedRef = useRef(false);
  const muteStateRef = useRef<Record<string, boolean>>({});
  const autoStartAttemptedRef = useRef(false);
  const [needsPlaybackResume, setNeedsPlaybackResume] = useState(false);

  const updateParticipantMuteState = useCallback((targetId: string, isMuted: boolean) => {
    muteStateRef.current[targetId] = isMuted;
    setParticipants(prev => {
      let hasUpdated = false;
      const next = prev.map(participant => {
        if (participant.id === targetId) {
          hasUpdated = true;
          return { ...participant, isMuted };
        }
        return participant;
      });
      return hasUpdated ? next : prev;
    });
  }, []);

  const applyStoredMuteState = useCallback((list: Participant[]) => {
    return list.map(participant => {
      const stored = muteStateRef.current[participant.id];
      if (typeof stored === 'boolean') {
        return { ...participant, isMuted: stored };
      }
      return participant;
    });
  }, []);

  const stopMixedAudio = useCallback(() => {
    if (mixedConsumerRef.current) {
      mixedConsumerRef.current.close();
      mixedConsumerRef.current = null;
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current.srcObject = null;
      audioElementRef.current = null;
    }
  }, []);

  // API ServerへのWebSocket接続（ユーザー参加/退出通知用）
  const { notifyLeave, notifyMuteState } = useRoomWebSocket({
    roomId,
    userId: userId,
    onUserJoined: (payload) => {
      setParticipants(prev => {
        if (prev.some(p => p.id === payload.userId)) return prev;
        return [...prev, {
          id: payload.userId,
          name: payload.userName || '名前なし',
          isMuted: typeof muteStateRef.current[payload.userId] === 'boolean'
            ? muteStateRef.current[payload.userId]
            : false
        }];
      });
    },
    onUserLeft: (payload) => {
      setParticipants(prev => prev.filter(p => p.id !== payload.userId));
      delete muteStateRef.current[payload.userId];
    },
    onUserMuteStateChanged: (payload) => {
      updateParticipantMuteState(payload.userId, payload.isMuted);
    },
    onError: (error) => {
      console.error('WebSocket error:', error);
    }
  });

  const connectToRoom = useCallback(async () => {
    const socket = io(SFU_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join-room', { roomId, userId }, async (response: SocketResponse) => {
        if (response.error || !response.rtpCapabilities) {
          console.error('Failed to join MCU server', response.error);
          return;
        }

        const device = new Device();
        await device.load({ routerRtpCapabilities: response.rtpCapabilities });
        deviceRef.current = device;
        setIsConnected(true);
      });
    });

    socket.on('mix-ready', (payload: { producerId: string | null }) => {
      if (payload.producerId) {
        consumeMixed();
      } else {
        stopMixedAudio();
      }
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      stopMixedAudio();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, userId]);

  useEffect(() => {
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    const initializeRoom = async () => {
      try {
        const config = new Configuration({ basePath: API_URL });
        const roomService = new RoomServiceApi(config);

        const response = await roomService.roomServiceGetRoom(roomId);

        if (response.data.room?.ownerId) {
          setOwnerId(response.data.room.ownerId);
        }

        if (response.data.users && Array.isArray(response.data.users)) {
          const participantsList: Participant[] = response.data.users.map((user: any) => ({
            id: user.userId || '',
            name: user.userName || '名前なし',
            isMuted: typeof user.isMuted === 'boolean' ? user.isMuted : false
          }));

          const isAlreadyJoined = participantsList.some(p => p.id === userId);
          if (!isAlreadyJoined) {
            await roomService.roomServiceJoinRoom(roomId, { userId, userName });
            const updatedResponse = await roomService.roomServiceGetRoom(roomId);
            if (updatedResponse.data.users && Array.isArray(updatedResponse.data.users)) {
              const updatedParticipants: Participant[] = updatedResponse.data.users.map((user: any) => ({
                id: user.userId || '',
                name: user.userName || '名前なし',
                isMuted: typeof user.isMuted === 'boolean' ? user.isMuted : false
              }));
              setParticipants(applyStoredMuteState(updatedParticipants));
            }
          } else {
            setParticipants(applyStoredMuteState(participantsList));
          }
        }
      } catch (error) {
        console.error('Failed to join or fetch room info:', error);
      }
    };

    initializeRoom();
    connectToRoom();

    return () => {
      socketRef.current?.disconnect();
      stopMixedAudio();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const createTransport = async (direction: 'send' | 'recv'): Promise<Transport | null> => {
    const rtcConfig = {
      iceServers: [{ urls: ['stun:stun.l.google.com:19302'] }]
    };
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
              iceServers: rtcConfig.iceServers,
            } as any)
          : deviceRef.current?.createRecvTransport({
              id: response.id,
              iceParameters: response.iceParameters,
              iceCandidates: response.iceCandidates,
              dtlsParameters: response.dtlsParameters,
              iceServers: rtcConfig.iceServers,
            } as any);

        if (!transport) {
          resolve(null);
          return;
        }

        transport.on('connect', (params: { dtlsParameters: unknown }, callback: () => void, errback: (error: Error) => void) => {
          socketRef.current?.emit('connect-transport', {
            transportId: transport.id,
            dtlsParameters: params.dtlsParameters
          }, (res: SocketResponse) => {
            if (res.error) {
              errback(new Error(res.error));
            } else {
              callback();
            }
          });
        });

        if (direction === 'send') {
          transport.on('produce', (params: { kind: string; rtpParameters: unknown }, callback: (params: { id: string }) => void, errback: (error: Error) => void) => {
            socketRef.current?.emit('produce', {
              roomId,
              transportId: transport.id,
              kind: params.kind,
              rtpParameters: params.rtpParameters,
              userId
            }, (res: SocketResponse) => {
              if (res.error) {
                errback(new Error(res.error));
              } else if (res.id) {
                callback({ id: res.id });
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const audioTrack = stream.getAudioTracks()[0];

      if (!producerTransportRef.current) {
        const transport = await createTransport('send');
        if (!transport) return;
        producerTransportRef.current = transport;
      }

      const producer = await producerTransportRef.current.produce({ track: audioTrack });
      audioProducerRef.current = producer;
      setAudioEnabled(true);
      notifyMuteState(false);
      updateParticipantMuteState(userId, false);
    } catch (error: any) {
      console.error('Failed to start audio:', error);
      const errName = error?.name || '';
      if (errName === 'NotAllowedError' || errName === 'SecurityError') {
        alert('マイクへのアクセスが拒否されました。ブラウザの権限設定を確認してください。');
      } else if (errName === 'NotFoundError') {
        alert('入力デバイスが見つかりませんでした。マイクを接続してから再試行してください。');
      } else {
        const msg = (typeof error?.message === 'string' && error.message) ? error.message : '不明な理由';
        alert(`音声の送信開始に失敗しました (${msg})。ネットワーク接続やサーバー状態を確認してください。`);
      }
    }
  };

  useEffect(() => {
    if (!isConnected || autoStartAttemptedRef.current) {
      return;
    }
    autoStartAttemptedRef.current = true;
    startAudio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  const stopAudio = () => {
    if (audioProducerRef.current) {
      audioProducerRef.current.close();
      audioProducerRef.current = null;
    }
    setAudioEnabled(false);
    notifyMuteState(true);
    updateParticipantMuteState(userId, true);
  };

  const consumeMixed = async () => {
    if (!deviceRef.current) return;

    try {
      if (!consumerTransportRef.current) {
        const transport = await createTransport('recv');
        if (!transport) return;
        consumerTransportRef.current = transport;
      }

      socketRef.current?.emit('consume-mix', {
        roomId,
        userId,
        rtpCapabilities: deviceRef.current.rtpCapabilities
      }, async (response: SocketResponse) => {
        if (response.error === 'no mixed producer') {
          return;
        }
        if (response.error || !response.id || !response.producerId || !response.kind || !response.rtpParameters) {
          console.error('Consume mix failed:', response.error);
          return;
        }

        const consumer = await consumerTransportRef.current!.consume({
          id: response.id,
          producerId: response.producerId,
          kind: response.kind,
          rtpParameters: response.rtpParameters
        });

        mixedConsumerRef.current?.close();
        mixedConsumerRef.current = consumer;

        if (!audioElementRef.current) {
          audioElementRef.current = new Audio();
        }
        audioElementRef.current.srcObject = new MediaStream([consumer.track]);
        audioElementRef.current.play().catch(() => {
          console.warn('自動再生がブロックされました。クリックなどの操作後に再試行してください。');
          setNeedsPlaybackResume(true);
        });
        // Chrome で自動再生がサイレントに失敗する場合のフォロー
        setTimeout(() => {
          if (audioElementRef.current && audioElementRef.current.paused) {
            setNeedsPlaybackResume(true);
          }
        }, 500);
      });
    } catch (error) {
      console.error('Consume mixed error:', error);
    }
  };

  const resumePlayback = async () => {
    try {
      if (audioElementRef.current) {
        await audioElementRef.current.play();
        setNeedsPlaybackResume(false);
      } else {
        await consumeMixed();
      }
    } catch (e) {
      console.error('再生再開に失敗しました', e);
    }
  };

  const toggleAudio = () => {
    if (audioEnabled) {
      stopAudio();
    } else {
      startAudio();
    }
  };

  const handleChangeAudio = async () => {

  };

  const handleLeave = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const config = new Configuration({ basePath: apiUrl });
      const roomService = new RoomServiceApi(config);

      if (ownerId && userId === ownerId) {
        await roomService.roomServiceDeleteRoom(roomId, { userId });
      } else {
        await roomService.roomServiceLeaveRoom(roomId, { userId });
      }
    } catch (error) {
      console.error('Failed to leave/delete room:', error);
    } finally {
      notifyLeave();
      stopAudio();
      stopMixedAudio();
      socketRef.current?.disconnect();
      router.push('/');
    }
  };

  return (
    <>
      <Room
        roomId={roomId}
        participants={participants}
        audioEnabled={audioEnabled}
        onToggleAudio={toggleAudio}
        onChangeAudio={handleChangeAudio}
        onLeave={handleLeave}
      />
      {needsPlaybackResume && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <button
            className="bg-green-600 text-white px-4 py-2 rounded shadow-md"
            onClick={resumePlayback}
          >
            音声を再生する
          </button>
        </div>
      )}
    </>
  );
}
