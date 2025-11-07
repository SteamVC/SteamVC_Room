import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import * as mediasoup from 'mediasoup';
import { Worker, Router, Transport, Producer, Consumer } from 'mediasoup/node/lib/types';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(express.json());

// Mediasoup設定
const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2
  }
];

// グローバル変数
let worker: Worker;
const routers = new Map<string, Router>();
const transports = new Map<string, Transport>();
const producers = new Map<string, Producer>();
const consumers = new Map<string, Consumer>();
const rooms = new Map<string, Set<string>>(); // roomId -> Set<socketId>

async function createWorker() {
  worker = await mediasoup.createWorker({
    logLevel: 'warn',
    rtcMinPort: 10000,
    rtcMaxPort: 10100
  });

  console.log(`Mediasoup Worker created [pid:${worker.pid}]`);

  worker.on('died', (error) => {
    console.error('Mediasoup worker died', error);
    setTimeout(() => process.exit(1), 2000);
  });

  return worker;
}

async function createRouter(roomId: string) {
  if (!worker) {
    await createWorker();
  }

  const router = await worker.createRouter({ mediaCodecs });
  routers.set(roomId, router);
  console.log(`Router created for room: ${roomId}`);
  return router;
}

// REST API
app.get('/health', (req, res) => {
  res.json({ status: 'ok', worker: worker?.pid });
});

// ルーム作成通知を受け取る
app.post('/api/rooms/:roomId/create', async (req, res) => {
  const { roomId } = req.params;

  try {
    await createRouter(roomId);
    rooms.set(roomId, new Set());
    res.json({ success: true, roomId });
  } catch (error) {
    console.error('Router creation failed:', error);
    res.status(500).json({ error: 'Router creation failed' });
  }
});

// Socket.IO接続処理
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('join-room', async ({ roomId, userId }, callback) => {
    console.log(`User ${userId} joining room ${roomId}`);

    let router = routers.get(roomId);
    if (!router) {
      router = await createRouter(roomId);
      rooms.set(roomId, new Set());
    }

    socket.join(roomId);
    rooms.get(roomId)?.add(socket.id);

    callback({
      rtpCapabilities: router.rtpCapabilities
    });
  });

  socket.on('create-transport', async ({ roomId, direction }, callback) => {
    console.log(`Creating ${direction} transport for room ${roomId}`);

    const router = routers.get(roomId);
    if (!router) {
      callback({ error: 'Room not found' });
      return;
    }

    try {
      const transport = await router.createWebRtcTransport({
        listenIps: [
          {
            ip: '0.0.0.0',
            announcedIp: process.env.ANNOUNCED_IP || '127.0.0.1'
          }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
      });

      transports.set(transport.id, transport);

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });
    } catch (error) {
      console.error('Transport creation failed:', error);
      callback({ error: 'Transport creation failed' });
    }
  });

  socket.on('connect-transport', async ({ transportId, dtlsParameters }, callback) => {
    const transport = transports.get(transportId);
    if (!transport) {
      callback({ error: 'Transport not found' });
      return;
    }

    try {
      await transport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (error) {
      console.error('Transport connection failed:', error);
      callback({ error: 'Transport connection failed' });
    }
  });

  socket.on('produce', async ({ transportId, kind, rtpParameters }, callback) => {
    const transport = transports.get(transportId);
    if (!transport) {
      callback({ error: 'Transport not found' });
      return;
    }

    try {
      const producer = await transport.produce({ kind, rtpParameters });
      producers.set(producer.id, producer);

      producer.on('transportclose', () => {
        console.log(`Producer transport closed: ${producer.id}`);
        producers.delete(producer.id);
      });

      callback({ id: producer.id });

      // 他の参加者に通知
      socket.broadcast.emit('new-producer', { producerId: producer.id });
    } catch (error) {
      console.error('Produce failed:', error);
      callback({ error: 'Produce failed' });
    }
  });

  socket.on('consume', async ({ transportId, producerId, rtpCapabilities }, callback) => {
    const transport = transports.get(transportId);
    const producer = producers.get(producerId);

    if (!transport || !producer) {
      callback({ error: 'Transport or Producer not found' });
      return;
    }

    const router = routers.get([...routers.keys()][0]); // 簡略化
    if (!router || !router.canConsume({ producerId, rtpCapabilities })) {
      callback({ error: 'Cannot consume' });
      return;
    }

    try {
      const consumer = await transport.consume({
        producerId,
        rtpCapabilities,
        paused: false
      });

      consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        console.log(`Consumer transport closed: ${consumer.id}`);
        consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        console.log(`Producer closed for consumer: ${consumer.id}`);
        consumers.delete(consumer.id);
        socket.emit('consumer-closed', { consumerId: consumer.id });
      });

      callback({
        id: consumer.id,
        producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters
      });
    } catch (error) {
      console.error('Consume failed:', error);
      callback({ error: 'Consume failed' });
    }
  });

  socket.on('leave-room', ({ roomId }) => {
    console.log(`User leaving room ${roomId}`);
    socket.leave(roomId);
    rooms.get(roomId)?.delete(socket.id);

    // クリーンアップ
    if (rooms.get(roomId)?.size === 0) {
      routers.delete(roomId);
      rooms.delete(roomId);
      console.log(`Room ${roomId} cleaned up`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);

    // クリーンアップ処理
    rooms.forEach((participants, roomId) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          routers.delete(roomId);
          rooms.delete(roomId);
          console.log(`Room ${roomId} cleaned up`);
        }
      }
    });
  });
});

// サーバー起動
const PORT = process.env.PORT || 3000;

async function startServer() {
  await createWorker();

  server.listen(PORT, () => {
    console.log(`SFU Server running on port ${PORT}`);
  });
}

startServer();
