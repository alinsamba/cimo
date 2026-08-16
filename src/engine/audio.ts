import type { EqualizerBand, EqualizerPreset } from '../core/types';

export const EQUALIZER_FREQUENCIES = [
  32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
] as const;

export const MIN_GAIN_DB = -12;
export const MAX_GAIN_DB = 12;
export const MIN_VOLUME = 0.0;
export const MAX_VOLUME = 2.0; // 200% volume boost

export const EQUALIZER_PRESETS: readonly EqualizerPreset[] = [
  {
    name: 'Flat',
    gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    name: 'Bass Boost',
    gains: [6, 5, 4, 2, 1, 0, 0, 0, 0, 0],
  },
  {
    name: 'Treble Boost',
    gains: [0, 0, 0, 0, 0, 1, 2, 4, 5, 6],
  },
  {
    name: 'Vocal',
    gains: [-2, -1, 0, 2, 4, 4, 3, 1, -1, -2],
  },
  {
    name: 'Rock',
    gains: [4, 3, 2, 0, -1, 0, 2, 3, 4, 4],
  },
  {
    name: 'Pop',
    gains: [-1, 1, 3, 4, 4, 2, 0, 1, 2, 3],
  },
  {
    name: 'Cinema',
    gains: [4, 3, 1, 0, 2, 3, 2, 1, 3, 4],
  },
  {
    name: 'Night Mode',
    gains: [-4, -3, -2, 0, 2, 3, 2, 0, -2, -4],
  },
  {
    name: 'Acoustic',
    gains: [3, 2, 1, 1, 2, 2, 3, 3, 2, 1],
  },
  {
    name: 'Electronic',
    gains: [5, 4, 2, 0, -2, 2, 1, 2, 4, 5],
  },
];

export interface DownmixCoefficients {
  leftGains: number[];
  rightGains: number[];
  dialogueBoostDb: number;
}

export function calculateDownmixGains(
  channelCount: number,
  dialogueBoostDb: number = 3
): DownmixCoefficients {
  // Convert dB boost to linear multiplier: 10^(dB / 20)
  const dialogueMultiplier = Math.pow(10, Math.max(0, Math.min(12, dialogueBoostDb)) / 20);
  const centerCoeff = 0.7071 * dialogueMultiplier;
  const surroundCoeff = 0.7071;
  const lfeCoeff = 0.5;

  if (channelCount === 6) {
    // 5.1 Surround: [FL, FR, FC, LFE, SL, SR]
    return {
      leftGains: [1.0, 0.0, centerCoeff, lfeCoeff, surroundCoeff, 0.0],
      rightGains: [0.0, 1.0, centerCoeff, lfeCoeff, 0.0, surroundCoeff],
      dialogueBoostDb,
    };
  }

  if (channelCount === 8) {
    // 7.1 Surround: [FL, FR, FC, LFE, BL, BR, SL, SR]
    return {
      leftGains: [1.0, 0.0, centerCoeff, lfeCoeff, surroundCoeff * 0.7, 0.0, surroundCoeff, 0.0],
      rightGains: [0.0, 1.0, centerCoeff, lfeCoeff, 0.0, surroundCoeff * 0.7, 0.0, surroundCoeff],
      dialogueBoostDb,
    };
  }

  // Stereo / Mono fallback
  return {
    leftGains: [1.0, 0.0],
    rightGains: [0.0, 1.0],
    dialogueBoostDb: 0,
  };
}

export interface AudioDSPConfig {
  audioContext?: AudioContext;
  mediaElement?: HTMLMediaElement;
  initialVolume?: number;
  initialPreset?: string;
  enableBitstreaming?: boolean;
  dialogueBoostDb?: number;
}

export class AudioDSPManager {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private filterNodes: BiquadFilterNode[] = [];

  private volume: number = 1.0;
  private muted: boolean = false;
  private previousVolumeBeforeMute: number = 1.0;

  private currentPreset: string | null = 'Flat';
  private bands: EqualizerBand[];
  private isBitstreaming: boolean = false;
  private dialogueBoostDb: number = 3.0;

  constructor(config?: AudioDSPConfig) {
    this.bands = EQUALIZER_FREQUENCIES.map((freq) => ({
      frequency: freq,
      gain: 0,
      q: 1.414,
    }));

    if (config?.initialVolume !== undefined) {
      this.volume = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, config.initialVolume));
    }
    if (config?.enableBitstreaming !== undefined) {
      this.isBitstreaming = config.enableBitstreaming;
    }
    if (config?.dialogueBoostDb !== undefined) {
      this.dialogueBoostDb = config.dialogueBoostDb;
    }

    if (config?.audioContext) {
      this.audioContext = config.audioContext;
    }

    if (config?.mediaElement) {
      this.attachMediaElement(config.mediaElement);
    }

    if (config?.initialPreset) {
      this.applyPreset(config.initialPreset);
    }
  }

  public attachMediaElement(element: HTMLMediaElement): void {
    const hasAudioCtx = typeof AudioContext !== 'undefined';
    const hasWebkitAudioCtx = typeof globalThis !== 'undefined' && 'webkitAudioContext' in globalThis;

    if (!hasAudioCtx && !hasWebkitAudioCtx && !this.audioContext) {
      return;
    }

    try {
      if (!this.audioContext) {
        const AudioCtx = typeof AudioContext !== 'undefined'
          ? AudioContext
          : (globalThis as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

        if (AudioCtx) {
          this.audioContext = new AudioCtx({
            sampleRate: 48000,
            latencyHint: 'playback',
          });
        }
      }
      if (!this.audioContext) return;

      if (this.audioContext.state === 'suspended') {
        const resumeOnGesture = () => {
          this.audioContext?.resume();
          document.removeEventListener('click', resumeOnGesture);
          document.removeEventListener('keydown', resumeOnGesture);
        };
        document.addEventListener('click', resumeOnGesture);
        document.addEventListener('keydown', resumeOnGesture);
      }

      this.sourceNode = this.audioContext.createMediaElementSource(element);
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.muted ? 0 : this.volume;

      // Create 10 Equalizer Filter Nodes
      this.filterNodes = this.bands.map((band, idx) => {
        const filter = this.audioContext!.createBiquadFilter();
        filter.frequency.value = band.frequency;
        filter.gain.value = band.gain;

        if (idx === 0) {
          filter.type = 'lowshelf';
        } else if (idx === this.bands.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = band.q || 1.414;
        }
        return filter;
      });

      // Chain audio graph: Source -> Filter0 -> ... -> Filter9 -> Gain -> Destination
      let lastNode: AudioNode = this.sourceNode;
      for (const filter of this.filterNodes) {
        lastNode.connect(filter);
        lastNode = filter;
      }
      lastNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
    } catch (e) {
      console.warn('WebAudio setup deferred or mock context used:', e);
    }
  }
  public detachMediaElement(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
  }

  public setVolume(val: number): void {
    const clamped = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, val));
    this.volume = clamped;
    if (this.muted && clamped > 0) {
      this.muted = false;
    }
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(this.muted ? 0 : clamped, this.audioContext.currentTime);
    }
  }

  public getVolume(): number {
    return this.volume;
  }
  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted) {
      this.previousVolumeBeforeMute = this.volume > 0 ? this.volume : 1.0;
    }
    if (this.gainNode && this.audioContext) {
      this.gainNode.gain.setValueAtTime(
        this.muted ? 0 : this.previousVolumeBeforeMute,
        this.audioContext.currentTime
      );
    }
    return this.muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }
  public setMuted(muted: boolean): void {
    if (this.muted === muted) return;
    this.toggleMute();
  }

  public resetEqualizer(): void {
    this.applyPreset('Flat');
  }

  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }
  public setGain(bandIndex: number, gainDb: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return;
    const clamped = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));
    this.bands[bandIndex].gain = clamped;
    this.currentPreset = null; // custom

    if (this.filterNodes[bandIndex] && this.audioContext) {
      this.filterNodes[bandIndex].gain.setValueAtTime(clamped, this.audioContext.currentTime);
    }
  }
  public getGain(bandIndex: number): number {
    if (bandIndex < 0 || bandIndex >= this.bands.length) return 0;
    return this.bands[bandIndex].gain;
  }

  public applyPreset(presetName: string): boolean {
    const preset = EQUALIZER_PRESETS.find(
      (p) => p.name.toLowerCase() === presetName.toLowerCase()
    );
    if (!preset) return false;

    this.currentPreset = preset.name;
    preset.gains.forEach((gain, idx) => {
      this.setGain(idx, gain);
    });
    this.currentPreset = preset.name;
    return true;
  }

  public setBitstreaming(enabled: boolean): void {
    this.isBitstreaming = enabled;
    // When bitstreaming over HDMI/S-PDIF passthrough is active, bypass EQ processing
    if (enabled) {
      this.applyPreset('Flat');
    }
  }

  public isBitstreamingEnabled(): boolean {
    return this.isBitstreaming;
  }

  public setDialogueEnhancement(boostDb: number): void {
    this.dialogueBoostDb = Math.max(0, Math.min(12, boostDb));
  }

  public getDialogueEnhancement(): number {
    return this.dialogueBoostDb;
  }

  public getPresets(): readonly EqualizerPreset[] {
    return EQUALIZER_PRESETS;
  }

  public getBands(): EqualizerBand[] {
    return this.bands.map((b) => ({ ...b }));
  }

  public getCurrentPreset(): string | null {
    return this.currentPreset;
  }
  public dispose(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }
    for (const filter of this.filterNodes) {
      try {
        filter.disconnect();
      } catch {}
    }
    this.filterNodes = [];
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
  }
}
