import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import * as mediasoup from 'mediasoup';
import type {
  Worker,
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCodecCapability,
  RtpParameters,
  PlainTransport,
  MediaKind,
} from 'mediasoup/node/lib/types';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

type Direction = 'send' | 'recv';

type PeerTransports = {
  send?: WebRtcTransport;
  recv?: WebRtcTransport;
};

type Peer = {
  userId: string;
  socketId: string;
  transports: PeerTransports;
  producer?: Producer;
  mixedProducer?: Producer;
  mixer?: MixerPipeline;
};

type RoomState = {
  router: Router;
  peers: Map<string, Peer>;
};

type CreateTransportRequest = {
  roomId: string;
  direction: Direction;
};

type TransportInfo = {
  id: string;
  iceParameters: any;
  iceCandidates: any;
  dtlsParameters: any;
};

type ProduceRequest = {
  roomId: string;
  transportId: string;
  kind: MediaKind;
  rtpParameters: RtpParameters;
  userId: string;
};

type ConnectTransportRequest = {
  transportId: string;
  dtlsParameters: any;
};

type ConsumeMixRequest = {
  roomId: string;
  userId: string;
  rtpCapabilities: any;
};

const MEDIA_CODECS: RtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 111,
    parameters: {
      useinbandfec: 1,
      minptime: 10,
    },
  },
];

const ANNOUNCED_IP = process.env.ANNOUNCED_IP || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const MAX_PORT = 65000;

// ユーザーごとのピッチ係数 (1.0 が無加工)
const PITCH_TABLE: Record<string, number> = {
  // 例: "user123": 0.9,
};

// UDPポートの簡易割り当て
let nextPort = 40000;
function allocatePort(): number {
  const port = nextPort;
  nextPort += 2;
  if (nextPort > MAX_PORT) {
    nextPort = 40000;
  }
  return port;
}

function randomSsrc(): number {
  // FFmpegが扱える安全な範囲に制限
  return 100000 + Math.floor(Math.random() * 900000000); // < 1e9
}

class MixerPipeline {
  private roomId: string;
  private targetUserId: string;
  private router: Router;
  private ffmpeg?: ChildProcessWithoutNullStreams;
  private inputs: Array<{ transport: PlainTransport; consumer: Consumer; sdpPath: string }> = [];
  private outputTransport?: PlainTransport;
  private mixProducer?: Producer;

  constructor(roomId: string, targetUserId: string, router: Router) {
    this.roomId = roomId;
    this.targetUserId = targetUserId;
    this.router = router;
  }

  async rebuild(inputs: Array<{ producer: Producer; pitch: number }>): Promise<Producer | undefined> {
    // 旧パイプラインは全て閉じてから再構築（シンプルに戻す）
    await this.close();

    if (inputs.length === 0) {
      return undefined;
    }

    const inputSpecs: Array<{ port: number; pitch: number; sdpPath: string }> = [];
    for (const input of inputs) {
      const port = allocatePort();
      const transport = await this.router.createPlainTransport({
        listenIp: '127.0.0.1',
        rtcpMux: true,
        comedia: false,
      });
      await transport.connect({ ip: '127.0.0.1', port });

      const consumer = await transport.consume({
        producerId: input.producer.id,
        rtpCapabilities: this.router.rtpCapabilities,
      });
      await consumer.resume();

      const sdpText = this.buildSdp(port, consumer.rtpParameters);
      const sdpPath = this.writeTempSdp(sdpText);

      this.inputs.push({ transport, consumer, sdpPath });
      inputSpecs.push({ port, pitch: input.pitch, sdpPath });
    }

    this.outputTransport = await this.router.createPlainTransport({
      listenIp: '0.0.0.0',
      rtcpMux: true,
      comedia: true,
    });

    const outputPort = this.outputTransport.tuple?.localPort;
    if (!outputPort) {
      throw new Error('failed to obtain output port');
    }

    const outPt = 111;
    const ssrc = randomSsrc();

    const args: string[] = [
      '-protocol_whitelist',
      'file,udp,rtp',
      '-fflags',
      '+genpts',
    ];

    inputSpecs.forEach((spec) => {
      args.push('-protocol_whitelist', 'file,udp,rtp', '-f', 'sdp', '-i', spec.sdpPath);
    });

    const filterParts: string[] = [];
    inputSpecs.forEach((spec, idx) => {
      filterParts.push(
        `[${idx}:a]asetrate=48000*${spec.pitch},aresample=48000,atempo=${1 / spec.pitch}[p${idx}]`,
      );
    });
    const amixInputs = inputSpecs.map((_, idx) => `[p${idx}]`).join('');
    filterParts.push(`${amixInputs}amix=inputs=${inputSpecs.length}:normalize=0[mixed]`);
    args.push('-filter_complex', filterParts.join(';'));

    args.push(
      '-map',
      '[mixed]',
      '-c:a',
      'libopus',
      '-application',
      'voip',
      '-b:a',
      '96k',
      '-ac',
      '2',
      '-payload_type',
      `${outPt}`,
      '-ssrc',
      `${ssrc}`,
      '-f',
      'rtp',
      `rtp://127.0.0.1:${outputPort}`,
    );

    this.ffmpeg = spawn('ffmpeg', args);
    this.ffmpeg.stderr.on('data', (data) => {
      console.error(`[ffmpeg ${this.roomId}/${this.targetUserId}] ${data.toString()}`);
    });
    this.ffmpeg.on('close', (code) => {
      console.log(`FFmpeg closed for ${this.roomId}/${this.targetUserId} with code ${code}`);
    });

    const rtpParameters: RtpParameters = {
      codecs: [
        {
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2,
          payloadType: outPt,
          parameters: {
            useinbandfec: 1,
            minptime: 10,
          },
        },
      ],
      encodings: [{ ssrc }],
      headerExtensions: [],
    };

    this.mixProducer = await this.outputTransport.produce({
      kind: 'audio',
      rtpParameters,
      appData: { targetUserId: this.targetUserId },
    });

    return this.mixProducer;
  }

  getProducer(): Producer | undefined {
    return this.mixProducer;
  }

  async close() {
    if (this.ffmpeg) {
      this.ffmpeg.kill('SIGKILL');
    }
    this.ffmpeg = undefined;

    for (const input of this.inputs) {
      try {
        await input.consumer.close();
      } catch (e) {
        /* noop */
      }
      try {
        await input.transport.close();
      } catch (e) {
        /* noop */
      }
      if (input.sdpPath) {
        try {
          fs.unlinkSync(input.sdpPath);
        } catch (e) {
          /* noop */
        }
      }
    }
    this.inputs = [];

    if (this.mixProducer) {
      try {
        await this.mixProducer.close();
      } catch (e) {
        /* noop */
      }
    }
    this.mixProducer = undefined;

    if (this.outputTransport) {
      try {
        await this.outputTransport.close();
      } catch (e) {
        /* noop */
      }
    }
    this.outputTransport = undefined;
  }

  private buildSdp(port: number, rtp: RtpParameters): string {
    const codec = rtp.codecs.find((c) => c.mimeType.toLowerCase() === 'audio/opus') || rtp.codecs[0];
    const pt = codec?.payloadType ?? 111;
    const fmtpLine =
      codec?.parameters && Object.keys(codec.parameters).length > 0
        ? `a=fmtp:${pt} ` +
          Object.entries(codec.parameters)
            .map(([k, v]) => `${k}=${v}`)
            .join(';')
        : '';
    const extmaps =
      rtp.headerExtensions?.map((ext, idx) => `a=extmap:${idx + 1} ${ext.uri}`) ?? [];
    const ssrc = rtp.encodings?.[0]?.ssrc;

    return [
      'v=0',
      'o=- 0 0 IN IP4 127.0.0.1',
      's=mediasoup-plain-rtp',
      'c=IN IP4 127.0.0.1',
      't=0 0',
      `m=audio ${port} RTP/AVP ${pt}`,
      `a=rtpmap:${pt} opus/48000/2`,
      fmtpLine,
      ...extmaps,
      'a=rtcp-mux',
      `a=rtcp:${port}`,
      ssrc ? `a=ssrc:${ssrc} cname:mix` : '',
      'a=recvonly',
      '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  private writeTempSdp(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'steamvc-sdp-'));
    const file = path.join(dir, 'input.sdp');
    fs.writeFileSync(file, content, 'utf8');
    return file;
  }
}

class RoomManager {
  private worker?: Worker;
  private rooms: Map<string, RoomState> = new Map();

  async getRouter(roomId: string): Promise<Router> {
    let room = this.rooms.get(roomId);
    if (room) return room.router;
    const worker = await this.ensureWorker();
    const router = await worker.createRouter({ mediaCodecs: MEDIA_CODECS });
    room = { router, peers: new Map() };
    this.rooms.set(roomId, room);
    return router;
  }

  getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  async ensureWorker(): Promise<Worker> {
    if (this.worker) return this.worker;
    this.worker = await mediasoup.createWorker({
      logLevel: 'warn',
      rtcMinPort: 10000,
      rtcMaxPort: 10100,
    });

    this.worker.on('died', () => {
      console.error('Mediasoup worker died, exiting in 2s');
      setTimeout(() => process.exit(1), 2000);
    });
    console.log(`Mediasoup worker started pid=${this.worker.pid}`);
    return this.worker;
  }
}

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, { cors: { origin: '*', methods: ['GET', 'POST'] } });
const roomManager = new RoomManager();

app.get('/health', (_req, res) => res.json({ ok: true }));

io.on('connection', (socket) => {
  console.log(`socket connected ${socket.id}`);

  socket.on('join-room', async ({ roomId, userId }: { roomId: string; userId: string }, callback) => {
    try {
      const router = await roomManager.getRouter(roomId);
      const room = roomManager.getRoom(roomId);
      if (!room) throw new Error('room failed to create');
      const peer: Peer = {
        userId,
        socketId: socket.id,
        transports: {},
      };
      room.peers.set(userId, peer);
      socket.join(roomId);
      callback({ rtpCapabilities: router.rtpCapabilities });
    } catch (e) {
      console.error('join-room error', e);
      callback({ error: 'failed to join room' });
    }
  });

  socket.on('create-transport', async ({ roomId, direction }: CreateTransportRequest, callback) => {
    try {
      const room = roomManager.getRoom(roomId);
      if (!room) {
        callback({ error: 'room not found' });
        return;
      }
      const transport = await room.router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: ANNOUNCED_IP }],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true,
      });
      const peer = findPeerBySocket(room, socket.id);
      if (!peer) {
        callback({ error: 'peer not found' });
        return;
      }
      if (direction === 'send') {
        peer.transports.send = transport;
      } else {
        peer.transports.recv = transport;
      }
      const payload: TransportInfo = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
      callback(payload);
    } catch (e) {
      console.error('create-transport error', e);
      callback({ error: 'transport creation failed' });
    }
  });

  socket.on('connect-transport', async ({ transportId, dtlsParameters }: ConnectTransportRequest, callback) => {
    try {
      const { transport } = findTransport(transportId);
      if (!transport) {
        callback({ error: 'transport not found' });
        return;
      }
      await transport.connect({ dtlsParameters });
      callback({ success: true });
    } catch (e) {
      console.error('connect-transport error', e);
      callback({ error: 'transport connect failed' });
    }
  });

  socket.on('produce', async (req: ProduceRequest, callback) => {
    try {
      const { transport, room } = findTransport(req.transportId);
      if (!transport || !room) {
        callback({ error: 'transport not found' });
        return;
      }
      const peer = room.peers.get(req.userId);
      if (!peer) {
        callback({ error: 'peer not found' });
        return;
      }
      const producer = await transport.produce({
        kind: req.kind,
        rtpParameters: req.rtpParameters,
        appData: { userId: req.userId },
      });
      peer.producer = producer;

      producer.on('transportclose', async () => {
        peer.producer = undefined;
        await rebuildMixers(room);
      });
      producer.observer.on('close', async () => {
        peer.producer = undefined;
        await rebuildMixers(room);
      });

      await rebuildMixers(room);

      callback({ id: producer.id });
      socket.to([...socket.rooms].filter((r) => r === req.roomId)).emit('producer-added', {
        userId: req.userId,
      });
    } catch (e) {
      console.error('produce error', e);
      callback({ error: 'produce failed' });
    }
  });

  socket.on('consume-mix', async (req: ConsumeMixRequest, callback) => {
    try {
      const room = roomManager.getRoom(req.roomId);
      if (!room) {
        callback({ error: 'room not found' });
        return;
      }
      const peer = room.peers.get(req.userId);
      if (!peer) {
        callback({ error: 'peer not found' });
        return;
      }

      if (!peer.mixer || !peer.mixedProducer) {
        await rebuildMixForPeer(room, req.userId);
      }

      if (!peer.mixedProducer) {
        callback({ error: 'no mixed producer' });
        return;
      }

      const transport = peer.transports.recv;
      if (!transport) {
        callback({ error: 'recv transport missing' });
        return;
      }
      if (
        !room.router.canConsume({
          producerId: peer.mixedProducer.id,
          rtpCapabilities: req.rtpCapabilities,
        })
      ) {
        callback({ error: 'cannot consume' });
        return;
      }
      const consumer = await transport.consume({
        producerId: peer.mixedProducer.id,
        rtpCapabilities: req.rtpCapabilities,
        paused: false,
      });
      callback({
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
      });
    } catch (e) {
      console.error('consume-mix error', e);
      callback({ error: 'consume mix failed' });
    }
  });

  socket.on('disconnect', async () => {
    for (const [roomId, room] of (roomManager as any).getRooms()) {
      const peer = findPeerBySocket(room, socket.id);
      if (peer) {
        room.peers.delete(peer.userId);
        await rebuildMixers(room);
        if (room.peers.size === 0) {
          (roomManager as any).deleteRoom(roomId);
        }
      }
    }
  });
});

function findPeerBySocket(room: RoomState, socketId: string): Peer | undefined {
  for (const peer of room.peers.values()) {
    if (peer.socketId === socketId) return peer;
  }
  return undefined;
}

function findTransport(transportId: string): { transport?: WebRtcTransport; room?: RoomState } {
  for (const [, room] of (roomManager as any).getRooms()) {
    for (const peer of room.peers.values()) {
      if (peer.transports.send?.id === transportId) {
        return { transport: peer.transports.send, room };
      }
      if (peer.transports.recv?.id === transportId) {
        return { transport: peer.transports.recv, room };
      }
    }
  }
  return {};
}

async function rebuildMixers(room: RoomState) {
  for (const peer of room.peers.values()) {
    await rebuildMixForPeer(room, peer.userId);
  }
}

async function rebuildMixForPeer(room: RoomState, targetUserId: string) {
  const target = room.peers.get(targetUserId);
  if (!target) return;

  const inputs = Array.from(room.peers.values())
    .filter((p) => p.userId !== targetUserId && p.producer)
    .map((p) => ({
      producer: p.producer as Producer,
      pitch: PITCH_TABLE[p.userId] ?? 1.0,
    }));

  if (!target.mixer) {
    target.mixer = new MixerPipeline(room.router.id, targetUserId, room.router);
  }

  const mixedProducer = await target.mixer.rebuild(inputs);
  target.mixedProducer = mixedProducer;

  const socket = io.sockets.sockets.get(target.socketId);
  if (socket) {
    socket.emit('mix-ready', { producerId: mixedProducer ? mixedProducer.id : null });
  }
}

// RoomManager の補助メソッド
(RoomManager.prototype as any).getRooms = function (): Array<[string, RoomState]> {
  return Array.from(this.rooms.entries());
};

(RoomManager.prototype as any).deleteRoom = function (roomId: string) {
  const room = this.rooms.get(roomId);
  if (!room) return;
  for (const peer of room.peers.values()) {
    peer.transports.send?.close();
    peer.transports.recv?.close();
    peer.producer?.close();
    peer.mixer?.close();
  }
  this.rooms.delete(roomId);
};

server.listen(PORT, async () => {
  await roomManager.ensureWorker();
  console.log(`MCU server listening on ${PORT}`);
});
