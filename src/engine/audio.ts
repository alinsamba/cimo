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

export interface AudioDSPConfig {
  audioContext?: AudioContext;
  mediaElement?: HTMLMediaElement;
  initialVolume?: number;
  initialPreset?: string;
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

  constructor(config?: AudioDSPConfig) {
    this.bands = EQUALIZER_FREQUENCIES.map((freq) => ({
      frequency: freq,
      gain: 0,
      q: 1.414,
    }));

    if (config?.initialVolume !== undefined) {
      this.volume = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, config.initialVolume));
    }

    if (config?.audioContext) {
      this.audioContext = config.audioContext;
      this.initAudioGraph();
    } else if (typeof window !== 'undefined') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        try {
          this.audioContext = new AudioContextClass();
          this.initAudioGraph();
        } catch {
          // AudioContext initialization in restricted environments (e.g. autoplay policy)
        }
      }
    }

    if (config?.mediaElement && this.audioContext) {
      this.attachMediaElement(config.mediaElement);
    }

    if (config?.initialPreset) {
      this.applyPreset(config.initialPreset);
    }
  }

  /**
   * Initializes the Web Audio nodes graph:
   * Source -> GainNode -> Filter 0 -> ... -> Filter 9 -> Destination
   */
  private initAudioGraph(): void {
    if (!this.audioContext) return;

    try {
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.setValueAtTime(
        this.muted ? 0 : this.volume,
        this.audioContext.currentTime
      );

      this.filterNodes = this.bands.map((band, index) => {
        const filter = this.audioContext!.createBiquadFilter();
        
        if (index === 0) {
          filter.type = 'lowshelf';
        } else if (index === this.bands.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
        }

        filter.frequency.setValueAtTime(band.frequency, this.audioContext!.currentTime);
        filter.gain.setValueAtTime(band.gain, this.audioContext!.currentTime);
        if (band.q !== undefined) {
          filter.Q.setValueAtTime(band.q, this.audioContext!.currentTime);
        }

        return filter;
      });

      // Chain filters in series
      for (let i = 0; i < this.filterNodes.length - 1; i++) {
        const current = this.filterNodes[i];
        const next = this.filterNodes[i + 1];
        if (current && next) {
          current.connect(next);
        }
      }

      // Connect last filter to destination
      const lastFilter = this.filterNodes[this.filterNodes.length - 1];
      if (lastFilter) {
        lastFilter.connect(this.audioContext.destination);
      }

      // Connect gainNode to first filter
      const firstFilter = this.filterNodes[0];
      if (this.gainNode && firstFilter) {
        this.gainNode.connect(firstFilter);
      }
    } catch {
      // Graceful fallback for mock/unsupported environments
    }
  }

  /**
   * Attaches an HTMLMediaElement to the DSP audio graph.
   */
  public attachMediaElement(element: HTMLMediaElement): void {
    if (!this.audioContext) {
      if (typeof window !== 'undefined') {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          try {
            this.audioContext = new AudioContextClass();
            this.initAudioGraph();
          } catch {
            return;
          }
        }
      }
    }

    if (!this.audioContext || !this.gainNode) return;

    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
      }

      this.sourceNode = this.audioContext.createMediaElementSource(element);
      this.sourceNode.connect(this.gainNode);
    } catch {
      // Already attached or unsupported
    }
  }

  /**
   * Detaches current media element from DSP.
   */
  public detachMediaElement(): void {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.sourceNode = null;
    }
  }

  /**
   * Sets master volume (0.0 to 2.0, where >1.0 represents volume boost).
   */
  public setVolume(val: number): void {
    const clamped = Math.max(MIN_VOLUME, Math.min(MAX_VOLUME, val));
    this.volume = clamped;

    if (!this.muted && this.gainNode && this.audioContext) {
      try {
        this.gainNode.gain.setValueAtTime(this.volume, this.audioContext.currentTime);
      } catch {
        this.gainNode.gain.value = this.volume;
      }
    }
  }

  /**
   * Returns current master volume (0.0 to 2.0).
   */
  public getVolume(): number {
    return this.volume;
  }

  /**
   * Sets mute status.
   */
  public setMuted(muted: boolean): void {
    this.muted = muted;

    if (this.gainNode && this.audioContext) {
      const targetGain = this.muted ? 0 : this.volume;
      try {
        this.gainNode.gain.setValueAtTime(targetGain, this.audioContext.currentTime);
      } catch {
        this.gainNode.gain.value = targetGain;
      }
    }
  }

  /**
   * Gets mute status.
   */
  public isMuted(): boolean {
    return this.muted;
  }

  /**
   * Toggles mute status.
   */
  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /**
   * Sets the gain for an individual frequency band (by index 0-9).
   *
   * @param bandIndex 0-9 corresponding to 32Hz, 64Hz, 125Hz, 250Hz, 500Hz, 1kHz, 2kHz, 4kHz, 8kHz, 16kHz.
   * @param gainDb Gain in decibels (-12 dB to +12 dB).
   */
  public setGain(bandIndex: number, gainDb: number): void {
    if (bandIndex < 0 || bandIndex >= this.bands.length) {
      return;
    }

    const clampedGain = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gainDb));
    const band = this.bands[bandIndex];
    if (band) {
      band.gain = clampedGain;
    }

    const filterNode = this.filterNodes[bandIndex];
    if (filterNode && this.audioContext) {
      try {
        filterNode.gain.setValueAtTime(clampedGain, this.audioContext.currentTime);
      } catch {
        filterNode.gain.value = clampedGain;
      }
    }

    this.currentPreset = null; // Custom equalizer curve
  }

  /**
   * Gets the gain in dB for a specific band index.
   */
  public getGain(bandIndex: number): number {
    return this.bands[bandIndex]?.gain ?? 0;
  }

  /**
   * Applies an equalizer preset by name.
   */
  public applyPreset(presetName: string): boolean {
    const preset = EQUALIZER_PRESETS.find(
      (p) => p.name.toLowerCase() === presetName.trim().toLowerCase()
    );

    if (!preset) {
      return false;
    }

    for (let i = 0; i < this.bands.length; i++) {
      const gain = preset.gains[i] ?? 0;
      const clampedGain = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, gain));
      const band = this.bands[i];
      if (band) {
        band.gain = clampedGain;
      }

      const filterNode = this.filterNodes[i];
      if (filterNode && this.audioContext) {
        try {
          filterNode.gain.setValueAtTime(clampedGain, this.audioContext.currentTime);
        } catch {
          filterNode.gain.value = clampedGain;
        }
      }
    }

    this.currentPreset = preset.name;
    return true;
  }

  /**
   * Gets the active preset name or null if custom.
   */
  public getCurrentPreset(): string | null {
    return this.currentPreset;
  }

  /**
   * Returns list of all available equalizer presets.
   */
  public getPresets(): EqualizerPreset[] {
    return [...EQUALIZER_PRESETS];
  }

  /**
   * Returns a copy of the current 10 equalizer bands configuration.
   */
  public getBands(): EqualizerBand[] {
    return this.bands.map((b) => ({ ...b }));
  }

  /**
   * Resets equalizer to Flat preset (0 dB for all bands).
   */
  public resetEqualizer(): void {
    this.applyPreset('Flat');
  }

  /**
   * Returns underlying AudioContext if available.
   */
  public getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  /**
   * Disposes audio nodes and closes AudioContext.
   */
  public dispose(): void {
    this.detachMediaElement();

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {
        // Ignore disconnect error
      }
      this.gainNode = null;
    }

    for (const filter of this.filterNodes) {
      try {
        filter.disconnect();
      } catch {
        // Ignore disconnect error
      }
    }
    this.filterNodes = [];

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {
        // Ignore close error
      }
      this.audioContext = null;
    }
  }
}
