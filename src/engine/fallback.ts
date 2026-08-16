import type { MediaProfileInfo, VideoCodecType } from './matrix';

export type DecodingTier = 'hardware-gpu' | 'software-cpu' | 'transcoded-stream';

export interface DecodingProbeResult {
  tier: DecodingTier;
  codec: string;
  isHardwareAccelerated: boolean;
  supported: boolean;
  powerEfficient: boolean;
  fallbackReason?: string;
}

export class DecodingFallbackManager {
  private currentTier: DecodingTier = 'hardware-gpu';
  private fallbackListeners: Array<(tier: DecodingTier, reason: string) => void> = [];

  constructor() {}

  public getCurrentTier(): DecodingTier {
    return this.currentTier;
  }

  public onFallback(listener: (tier: DecodingTier, reason: string) => void): () => void {
    this.fallbackListeners.push(listener);
    return () => {
      this.fallbackListeners = this.fallbackListeners.filter((l) => l !== listener);
    };
  }

  public async probeDecoderCapability(profile: MediaProfileInfo): Promise<DecodingProbeResult> {
    // 1. Hi10P (10-bit H.264) explicitly mandates CPU software fallback
    if (profile.isHi10P) {
      this.currentTier = 'software-cpu';
      return {
        tier: 'software-cpu',
        codec: 'h264-hi10p',
        isHardwareAccelerated: false,
        supported: true,
        powerEfficient: false,
        fallbackReason: '10-bit AVC/H.264 (Hi10P) requires multi-threaded CPU software fallback',
      };
    }

    // 2. WebCodecs hardware probe if supported in browser/webview runtime
    if (typeof VideoDecoder !== 'undefined' && typeof VideoDecoder.isConfigSupported === 'function') {
      try {
        const codecString = this.mapToFourCC(profile.videoCodec || 'h264', profile.colorDepth);
        const config = {
          codec: codecString,
          hardwareAcceleration: 'prefer-hardware' as const,
        };

        const support = await VideoDecoder.isConfigSupported(config);
        if (support.supported) {
          const isHw = support.config?.hardwareAcceleration === 'prefer-hardware';
          this.currentTier = isHw ? 'hardware-gpu' : 'software-cpu';
          return {
            tier: this.currentTier,
            codec: codecString,
            isHardwareAccelerated: isHw,
            supported: true,
            powerEfficient: support.config?.hardwareAcceleration === 'prefer-hardware',
          };
        }
      } catch (err) {
        console.warn('VideoDecoder probe failed, falling back to profile heuristics:', err);
      }
    }

    // 3. Heuristic capability resolution based on standard platform capabilities
    if (profile.recommendedDecoder === 'software') {
      this.currentTier = 'software-cpu';
      return {
        tier: 'software-cpu',
        codec: profile.videoCodec || 'unknown',
        isHardwareAccelerated: false,
        supported: true,
        powerEfficient: false,
        fallbackReason: 'Codec profile not supported by native GPU ASIC decoder',
      };
    }

    this.currentTier = 'hardware-gpu';
    return {
      tier: 'hardware-gpu',
      codec: profile.videoCodec || 'h264',
      isHardwareAccelerated: true,
      supported: true,
      powerEfficient: true,
    };
  }

  public triggerFallback(reason: string): void {
    if (this.currentTier !== 'software-cpu') {
      this.currentTier = 'software-cpu';
      console.warn(`[Cimo Decoder] GPU Hardware decoding error. Triggering seamless Software CPU fallback: ${reason}`);
      this.fallbackListeners.forEach((fn) => {
        try {
          fn('software-cpu', reason);
        } catch (e) {
          console.error('Error in fallback listener:', e);
        }
      });
    }
  }

  private mapToFourCC(codec: VideoCodecType, colorDepth: number = 8): string {
    switch (codec) {
      case 'av01':
        return colorDepth === 10 ? 'av01.0.08M.10' : 'av01.0.04M.08';
      case 'hevc':
        return colorDepth === 10 ? 'hev1.2.4.L153.B0' : 'hev1.1.6.L93.B0';
      case 'h264':
        return 'avc1.640028';
      case 'vp09':
        return colorDepth === 10 ? 'vp09.02.10.10' : 'vp09.00.10.08';
      case 'vp08':
        return 'vp8';
      default:
        return 'avc1.42E01E';
    }
  }
}
