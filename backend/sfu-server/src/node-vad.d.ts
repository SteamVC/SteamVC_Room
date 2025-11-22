declare module 'node-vad' {
  export class VAD {
    static Mode: {
      NORMAL: number;
      LOW_BITRATE: number;
      AGGRESSIVE: number;
      VERY_AGGRESSIVE: number;
    };

    static Event: {
      ERROR: number;
      NOISE: number;
      SILENCE: number;
      VOICE: number;
    };

    constructor(mode: number);

    processAudio(
      buffer: Buffer,
      sampleRate: number
    ): Promise<number>;
  }
}
