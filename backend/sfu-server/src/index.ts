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
import axios from 'axios';
import FormData from 'form-data';
import { Readable } from 'stream';
import { VAD } from 'node-vad';

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
  convertedProducer?: Producer;
  mixedProducer?: Producer;
  mixer?: MixerPipeline;
  voiceConverter?: VoiceConverter;
  conversionPipeline?: VoiceConversionPipeline;
  isSpeaking?: boolean;
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

// Seed-VC API設定
const SEED_VC_API_BASE = 'https://akatuki25-seed-vc-streaming.hf.space';
const CHUNK_LEN_MS = 500;
const OVERLAP_MS = 100;
const VOICE_CONVERSION_SAMPLE_RATE = 16000;
const BUFFER_DURATION_MS = 3000; // 3秒バッファ

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

class VoiceConverter {
  private sessionId?: string;
  private chunkIdCounter = 0;
  private outputBuffer: Buffer[] = [];
  private isBuffering = true;
  private bufferTargetSamples: number;

  constructor() {
    this.bufferTargetSamples = Math.floor((22050 * BUFFER_DURATION_MS) / 1000);
  }

  async initialize(): Promise<void> {
    const response = await axios.post(`${SEED_VC_API_BASE}/session`, {
      sample_rate: VOICE_CONVERSION_SAMPLE_RATE,
      use_uploaded_ref: false,
      ref_preset_id: 'default_female',
      chunk_len_ms: CHUNK_LEN_MS,
      overlap_ms: OVERLAP_MS,
    });
    this.sessionId = response.data.session_id;
    console.log(`VoiceConverter session created: ${this.sessionId}`);
  }

  async convertChunk(audioBuffer: Buffer): Promise<Buffer | null> {
    if (!this.sessionId) {
      throw new Error('VoiceConverter not initialized');
    }

    const formData = new FormData();
    formData.append('session_id', this.sessionId);
    formData.append('chunk_id', this.chunkIdCounter.toString());
    formData.append('audio', Readable.from(audioBuffer), {
      filename: 'chunk.wav',
      contentType: 'audio/wav',
    });

    const response = await axios.post(`${SEED_VC_API_BASE}/chunk`, formData, {
      headers: formData.getHeaders(),
      responseType: 'arraybuffer',
    });

    this.chunkIdCounter++;

    const convertedBuffer = Buffer.from(response.data);
    this.outputBuffer.push(convertedBuffer);

    // 3秒バッファリング
    const totalBufferedSamples = this.outputBuffer.reduce((sum, buf) => {
      return sum + Math.floor((buf.length - 44) / 2); // WAVヘッダー44バイト除外、16bit = 2byte/sample
    }, 0);

    if (this.isBuffering && totalBufferedSamples >= this.bufferTargetSamples) {
      this.isBuffering = false;
      console.log(`VoiceConverter buffering complete: ${totalBufferedSamples} samples`);
    }

    // バッファリング完了後は即座に返す
    if (!this.isBuffering && this.outputBuffer.length > 0) {
      return this.outputBuffer.shift()!;
    }

    return null;
  }

  async close(): Promise<void> {
    if (this.sessionId) {
      try {
        await axios.post(`${SEED_VC_API_BASE}/end`, { session_id: this.sessionId });
      } catch (e) {
        console.error('Failed to close VoiceConverter session', e);
      }
      this.sessionId = undefined;
    }
  }
}

class VoiceConversionPipeline {
  private userId: string;
  private router: Router;
  private voiceConverter: VoiceConverter;
  private vad: VAD;
  private inputTransport?: PlainTransport;
  private inputConsumer?: Consumer;
  private outputTransport?: PlainTransport;
  private convertedProducer?: Producer;
  private ffmpegInput?: ChildProcessWithoutNullStreams;
  private ffmpegOutput?: ChildProcessWithoutNullStreams;
  private isSpeaking = false;
  private onSpeakingChange?: (isSpeaking: boolean) => void;
  private tempDir: string;
  private chunkCounter = 0;
  private processingQueue: string[] = [];

  constructor(userId: string, router: Router, voiceConverter: VoiceConverter, onSpeakingChange?: (isSpeaking: boolean) => void) {
    this.userId = userId;
    this.router = router;
    this.voiceConverter = voiceConverter;
    this.vad = new VAD(VAD.Mode.AGGRESSIVE);
    this.onSpeakingChange = onSpeakingChange;
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `vc-${userId}-`));
  }

  async start(sourceProducer: Producer): Promise<Producer> {
    // 入力: sourceProducerからRTP受信
    const inputPort = allocatePort();
    this.inputTransport = await this.router.createPlainTransport({
      listenIp: '127.0.0.1',
      rtcpMux: true,
      comedia: false,
    });
    await this.inputTransport.connect({ ip: '127.0.0.1', port: inputPort });

    this.inputConsumer = await this.inputTransport.consume({
      producerId: sourceProducer.id,
      rtpCapabilities: this.router.rtpCapabilities,
    });
    await this.inputConsumer.resume();

    const sdpText = this.buildSdp(inputPort, this.inputConsumer.rtpParameters);
    const sdpPath = path.join(this.tempDir, 'input.sdp');
    fs.writeFileSync(sdpPath, sdpText, 'utf8');

    // 出力: 変換済み音声用PlainTransport
    this.outputTransport = await this.router.createPlainTransport({
      listenIp: '0.0.0.0',
      rtcpMux: true,
      comedia: true,
    });
    const outputPort = this.outputTransport.tuple?.localPort;
    if (!outputPort) {
      throw new Error('Failed to obtain output port');
    }

    // FFmpeg: 入力RTP → 500ms WAVファイル分割
    this.startInputFFmpeg(sdpPath);

    // FFmpeg: 変換済みWAV連結 → 出力RTP
    this.startOutputFFmpeg(outputPort);

    // 出力Producer作成
    const outPt = 111;
    const ssrc = randomSsrc();
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

    this.convertedProducer = await this.outputTransport.produce({
      kind: 'audio',
      rtpParameters,
      appData: { userId: this.userId },
    });

    console.log(`[${this.userId}] VoiceConversionPipeline started`);
    return this.convertedProducer;
  }

  private startInputFFmpeg(sdpPath: string) {
    const segmentPattern = path.join(this.tempDir, 'chunk_%d.wav');

    const args = [
      '-protocol_whitelist', 'file,udp,rtp',
      '-f', 'sdp',
      '-i', sdpPath,
      '-f', 'segment',
      '-segment_time', `${CHUNK_LEN_MS / 1000}`,
      '-ar', `${VOICE_CONVERSION_SAMPLE_RATE}`,
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      segmentPattern
    ];

    this.ffmpegInput = spawn('ffmpeg', args);
    this.ffmpegInput.stderr.on('data', (data) => {
      console.error(`[${this.userId}] FFmpeg input: ${data.toString()}`);
    });

    // ファイル監視: 新しいチャンクが作成されたら変換処理
    this.watchChunks();
  }

  private watchChunks() {
    const watcher = fs.watch(this.tempDir, async (eventType, filename) => {
      if (eventType === 'rename' && filename && filename.startsWith('chunk_') && filename.endsWith('.wav')) {
        const chunkPath = path.join(this.tempDir, filename);

        // ファイルが完全に書き込まれるまで待機
        setTimeout(async () => {
          try {
            const audioBuffer = fs.readFileSync(chunkPath);

            // VAD検出
            const vadResult = await this.vad.processAudio(audioBuffer, VOICE_CONVERSION_SAMPLE_RATE);
            const speaking = vadResult === VAD.Event.VOICE;

            if (speaking !== this.isSpeaking) {
              this.isSpeaking = speaking;
              this.onSpeakingChange?.(speaking);
              console.log(`[${this.userId}] VAD: ${speaking ? 'SPEAKING' : 'SILENCE'}`);
            }

            // 声質変換
            const convertedBuffer = await this.voiceConverter.convertChunk(audioBuffer);

            if (convertedBuffer) {
              // 変換済みチャンクをFFmpegに送信
              this.feedConvertedChunk(convertedBuffer);
              console.log(`[${this.userId}] Converted chunk sent to output (${convertedBuffer.length} bytes)`);
            }

            // 元のチャンク削除
            fs.unlinkSync(chunkPath);
          } catch (e) {
            console.error(`[${this.userId}] Chunk processing error:`, e);
          }
        }, 100);
      }
    });
  }

  private startOutputFFmpeg(outputPort: number) {
    // 変換済みWAVをstdinから受け取ってRTP送信
    const outPt = 111;
    const ssrc = randomSsrc();

    const args = [
      '-f', 'wav',
      '-ar', '22050',
      '-ac', '2',
      '-i', 'pipe:0',
      '-c:a', 'libopus',
      '-application', 'voip',
      '-b:a', '96k',
      '-ac', '2',
      '-ar', '48000',
      '-payload_type', `${outPt}`,
      '-ssrc', `${ssrc}`,
      '-f', 'rtp',
      `rtp://127.0.0.1:${outputPort}`,
    ];

    this.ffmpegOutput = spawn('ffmpeg', args);
    this.ffmpegOutput.stderr.on('data', (data) => {
      console.error(`[${this.userId}] FFmpeg output: ${data.toString()}`);
    });
    this.ffmpegOutput.on('close', (code) => {
      console.log(`[${this.userId}] FFmpeg output closed with code ${code}`);
    });

    console.log(`[${this.userId}] Output FFmpeg started`);
  }

  private feedConvertedChunk(convertedBuffer: Buffer) {
    if (this.ffmpegOutput && this.ffmpegOutput.stdin) {
      try {
        this.ffmpegOutput.stdin.write(convertedBuffer);
      } catch (e) {
        console.error(`[${this.userId}] Failed to write to FFmpeg stdin:`, e);
      }
    }
  }

  private buildSdp(port: number, rtp: RtpParameters): string {
    const codec = rtp.codecs.find((c) => c.mimeType.toLowerCase() === 'audio/opus') || rtp.codecs[0];
    const pt = codec?.payloadType ?? 111;
    const ssrc = rtp.encodings?.[0]?.ssrc;

    return [
      'v=0',
      'o=- 0 0 IN IP4 127.0.0.1',
      's=mediasoup-plain-rtp',
      'c=IN IP4 127.0.0.1',
      't=0 0',
      `m=audio ${port} RTP/AVP ${pt}`,
      `a=rtpmap:${pt} opus/48000/2`,
      'a=rtcp-mux',
      `a=rtcp:${port}`,
      ssrc ? `a=ssrc:${ssrc} cname:input` : '',
      'a=recvonly',
      '',
    ]
      .filter((l) => l !== '')
      .join('\n');
  }

  async close() {
    if (this.ffmpegInput) {
      this.ffmpegInput.kill('SIGKILL');
    }
    if (this.ffmpegOutput) {
      this.ffmpegOutput.kill('SIGKILL');
    }
    if (this.inputConsumer) {
      await this.inputConsumer.close();
    }
    if (this.inputTransport) {
      await this.inputTransport.close();
    }
    if (this.convertedProducer) {
      await this.convertedProducer.close();
    }
    if (this.outputTransport) {
      await this.outputTransport.close();
    }

    // 一時ディレクトリ削除
    try {
      fs.rmSync(this.tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error(`Failed to remove temp dir ${this.tempDir}:`, e);
    }
  }
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

  async rebuild(inputs: Array<{ producer: Producer }>): Promise<Producer | undefined> {
    // 旧パイプラインは全て閉じてから再構築
    await this.close();

    if (inputs.length === 0) {
      return undefined;
    }

    const inputSpecs: Array<{ port: number; sdpPath: string }> = [];
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
      inputSpecs.push({ port, sdpPath });
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

    // ピッチ変換削除、単純なミキシングのみ
    const amixInputs = inputSpecs.map((_, idx) => `[${idx}:a]`).join('');
    args.push('-filter_complex', `${amixInputs}amix=inputs=${inputSpecs.length}:normalize=0[mixed]`);

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

      // VoiceConverterセッション作成
      const voiceConverter = new VoiceConverter();
      await voiceConverter.initialize();
      console.log(`[${userId}] VoiceConverter session initialized`);

      const peer: Peer = {
        userId,
        socketId: socket.id,
        transports: {},
        voiceConverter,
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
        peer.convertedProducer = undefined;
        if (peer.conversionPipeline) {
          await peer.conversionPipeline.close();
          peer.conversionPipeline = undefined;
        }
        await rebuildMixers(room);
      });
      producer.observer.on('close', async () => {
        peer.producer = undefined;
        peer.convertedProducer = undefined;
        if (peer.conversionPipeline) {
          await peer.conversionPipeline.close();
          peer.conversionPipeline = undefined;
        }
        await rebuildMixers(room);
      });

      // VoiceConversionPipelineを起動
      if (peer.voiceConverter) {
        const pipeline = new VoiceConversionPipeline(
          req.userId,
          room.router,
          peer.voiceConverter,
          (isSpeaking) => {
            peer.isSpeaking = isSpeaking;
            // 発話状態が変わったらミキサー再構築
            rebuildMixers(room);
          }
        );
        const convertedProducer = await pipeline.start(producer);
        peer.conversionPipeline = pipeline;
        peer.convertedProducer = convertedProducer;
        console.log(`[${req.userId}] Voice conversion pipeline started`);
      }

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
        // VoiceConverter/Pipelineのクリーンアップ
        if (peer.conversionPipeline) {
          await peer.conversionPipeline.close();
          console.log(`[${peer.userId}] VoiceConversionPipeline closed`);
        }
        if (peer.voiceConverter) {
          await peer.voiceConverter.close();
          console.log(`[${peer.userId}] VoiceConverter session closed`);
        }

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

  // 発話中のconvertedProducerだけをミキシング対象にする
  const inputs = Array.from(room.peers.values())
    .filter((p) => {
      // 自分以外
      if (p.userId === targetUserId) return false;
      // convertedProducerが存在する
      if (!p.convertedProducer) return false;
      // 発話中（VADがtrueを返している）
      if (p.isSpeaking !== true) return false;
      return true;
    })
    .map((p) => ({
      producer: p.convertedProducer as Producer,
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
