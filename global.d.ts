/// <reference types="react" />
/// <reference types="react-dom" />

// Mediasoup型定義の拡張
declare module 'mediasoup-client/lib/types' {
  export interface RtpCodec {
    mimeType: string;
    clockRate: number;
    channels?: number;
    parameters?: Record<string, unknown>;
  }

  export interface RtpHeaderExtension {
    uri: string;
    id: number;
  }

  export interface RtpCapabilities {
    codecs?: RtpCodec[];
    headerExtensions?: RtpHeaderExtension[];
  }

  export interface DtlsParameters {
    role?: string;
    fingerprints?: Array<{
      algorithm: string;
      value: string;
    }>;
  }

  export interface Producer {
    id: string;
    kind: string;
    close(): void;
  }

  export interface Consumer {
    id: string;
    kind: string;
    track: MediaStreamTrack;
    close(): void;
  }

  export interface Transport {
    id: string;
    close(): void;
    connect(params: { dtlsParameters: DtlsParameters }): Promise<void>;
    produce(params: { track: MediaStreamTrack; kind?: string; rtpParameters?: unknown }): Promise<Producer>;
    consume(params: {
      id: string;
      producerId: string;
      kind: string;
      rtpParameters: unknown;
    }): Promise<Consumer>;
    on(event: string, listener: (...args: unknown[]) => void): void;
  }
}

declare module 'mediasoup-client' {
  import { RtpCapabilities } from 'mediasoup-client/lib/types';

  export class Device {
    loaded: boolean;
    rtpCapabilities?: RtpCapabilities;

    load(params: { routerRtpCapabilities: RtpCapabilities }): Promise<void>;
    createSendTransport(params: unknown): Transport;
    createRecvTransport(params: unknown): Transport;
  }

  export { Transport, RtpCapabilities } from 'mediasoup-client/lib/types';
}
