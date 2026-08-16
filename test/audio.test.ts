import { describe, expect, test, mock } from 'bun:test';
import {
  AudioDSPManager,
  EQUALIZER_FREQUENCIES,
  EQUALIZER_PRESETS,
  MIN_GAIN_DB,
  MAX_GAIN_DB,
  MIN_VOLUME,
  MAX_VOLUME,
} from '../src/engine/audio';

describe('AudioDSPManager - Core & State', () => {
  test('initializes with 10 equalizer bands at standard frequencies and 0 dB gain', () => {
    const dsp = new AudioDSPManager();
    const bands = dsp.getBands();

    expect(bands.length).toBe(10);
    expect(bands.map((b) => b.frequency)).toEqual([
      32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000,
    ]);

    for (const band of bands) {
      expect(band.gain).toBe(0);
    }

    expect(dsp.getCurrentPreset()).toBe('Flat');
    expect(dsp.getVolume()).toBe(1.0);
    expect(dsp.isMuted()).toBe(false);
  });

  test('handles volume boost up to 2.0 (200%) and clamps to valid range [0.0, 2.0]', () => {
    const dsp = new AudioDSPManager();

    dsp.setVolume(1.5);
    expect(dsp.getVolume()).toBe(1.5);

    dsp.setVolume(2.0); // 200% volume boost
    expect(dsp.getVolume()).toBe(2.0);

    // Over-boost clamping
    dsp.setVolume(3.5);
    expect(dsp.getVolume()).toBe(MAX_VOLUME);

    // Under-boost clamping
    dsp.setVolume(-0.5);
    expect(dsp.getVolume()).toBe(MIN_VOLUME);
  });

  test('handles mute and unmute toggling', () => {
    const dsp = new AudioDSPManager();

    dsp.setVolume(1.2);
    expect(dsp.isMuted()).toBe(false);

    dsp.setMuted(true);
    expect(dsp.isMuted()).toBe(true);

    const toggled = dsp.toggleMute();
    expect(toggled).toBe(false);
    expect(dsp.isMuted()).toBe(false);
    expect(dsp.getVolume()).toBe(1.2);
  });

  test('sets band gains and clamps within [-12 dB, +12 dB]', () => {
    const dsp = new AudioDSPManager();

    // Set band 0 (32Hz) to +6 dB
    dsp.setGain(0, 6);
    expect(dsp.getGain(0)).toBe(6);
    expect(dsp.getCurrentPreset()).toBeNull(); // Custom curve

    // Set band 9 (16kHz) to -8 dB
    dsp.setGain(9, -8);
    expect(dsp.getGain(9)).toBe(-8);

    // Upper bound clamping
    dsp.setGain(1, 20);
    expect(dsp.getGain(1)).toBe(MAX_GAIN_DB);

    // Lower bound clamping
    dsp.setGain(2, -25);
    expect(dsp.getGain(2)).toBe(MIN_GAIN_DB);

    // Out-of-bounds band index ignored safely
    dsp.setGain(99, 5);
    dsp.setGain(-1, 5);
  });
});

describe('AudioDSPManager - Equalizer Presets', () => {
  const expectedPresetNames = [
    'Flat',
    'Bass Boost',
    'Treble Boost',
    'Vocal',
    'Rock',
    'Pop',
    'Cinema',
    'Night Mode',
    'Acoustic',
    'Electronic',
  ];

  test('provides all 10 standard presets', () => {
    const dsp = new AudioDSPManager();
    const presets = dsp.getPresets();

    expect(presets.length).toBe(10);
    const names = presets.map((p) => p.name);
    expect(names).toEqual(expectedPresetNames);

    for (const preset of presets) {
      expect(preset.gains.length).toBe(10);
    }
  });

  test('applies presets correctly and updates band gains', () => {
    const dsp = new AudioDSPManager();

    // Apply Bass Boost
    const successBass = dsp.applyPreset('Bass Boost');
    expect(successBass).toBe(true);
    expect(dsp.getCurrentPreset()).toBe('Bass Boost');
    expect(dsp.getGain(0)).toBe(6); // 32Hz
    expect(dsp.getGain(1)).toBe(5); // 64Hz
    expect(dsp.getGain(2)).toBe(4); // 125Hz

    // Apply Treble Boost
    const successTreble = dsp.applyPreset('Treble Boost');
    expect(successTreble).toBe(true);
    expect(dsp.getCurrentPreset()).toBe('Treble Boost');
    expect(dsp.getGain(9)).toBe(6); // 16kHz
    expect(dsp.getGain(8)).toBe(5); // 8kHz

    // Apply Cinema
    const successCinema = dsp.applyPreset('Cinema');
    expect(successCinema).toBe(true);
    expect(dsp.getCurrentPreset()).toBe('Cinema');

    // Case-insensitive preset matching
    const successRock = dsp.applyPreset('rock');
    expect(successRock).toBe(true);
    expect(dsp.getCurrentPreset()).toBe('Rock');

    // Reset equalizer
    dsp.resetEqualizer();
    expect(dsp.getCurrentPreset()).toBe('Flat');
    for (let i = 0; i < 10; i++) {
      expect(dsp.getGain(i)).toBe(0);
    }
  });

  test('returns false when applying non-existent preset', () => {
    const dsp = new AudioDSPManager();
    const success = dsp.applyPreset('NonExistentPreset');
    expect(success).toBe(false);
  });
});

describe('AudioDSPManager - WebAudio Graph & Mocking', () => {
  interface MockAudioParam {
    value: number;
    setValueAtTime: (val: number, time: number) => void;
  }

  interface MockNode {
    connect: (target: unknown) => unknown;
    disconnect: () => void;
  }

  test('constructs and connects WebAudio graph when AudioContext is provided', () => {
    const createdNodes: MockNode[] = [];
    const filterTypes: string[] = [];

    const mockContext = {
      currentTime: 0,
      state: 'running',
      destination: { isDestination: true } as unknown as AudioDestinationNode,
      createGain: () => {
        const gainParam: MockAudioParam = {
          value: 1,
          setValueAtTime: (val: number) => {
            gainParam.value = val;
          },
        };
        const node = {
          gain: gainParam,
          connect: mock((_target: unknown) => _target),
          disconnect: mock(() => {}),
        };
        createdNodes.push(node);
        return node as unknown as GainNode;
      },
      createBiquadFilter: () => {
        const freqParam: MockAudioParam = {
          value: 0,
          setValueAtTime: (val: number) => {
            freqParam.value = val;
          },
        };
        const gainParam: MockAudioParam = {
          value: 0,
          setValueAtTime: (val: number) => {
            gainParam.value = val;
          },
        };
        const qParam: MockAudioParam = {
          value: 1,
          setValueAtTime: (val: number) => {
            qParam.value = val;
          },
        };
        const node = {
          type: 'peaking',
          frequency: freqParam,
          gain: gainParam,
          Q: qParam,
          connect: mock((_target: unknown) => _target),
          disconnect: mock(() => {}),
        };
        filterTypes.push(node.type);
        createdNodes.push(node);
        return node as unknown as BiquadFilterNode;
      },
      createMediaElementSource: (_element: HTMLMediaElement) => {
        return {
          connect: mock((_target: unknown) => _target),
          disconnect: mock(() => {}),
        } as unknown as MediaElementAudioSourceNode;
      },
      close: mock(async () => {}),
    } as unknown as AudioContext;

    const dsp = new AudioDSPManager({
      audioContext: mockContext,
      initialVolume: 1.5,
      initialPreset: 'Bass Boost',
    });

    expect(dsp.getAudioContext()).toBe(mockContext);
    expect(dsp.getVolume()).toBe(1.5);
    expect(dsp.getCurrentPreset()).toBe('Bass Boost');

    // Update gain and volume with active AudioContext
    dsp.setVolume(1.8);
    dsp.setGain(0, 8);
    expect(dsp.getGain(0)).toBe(8);

    // Mute/unmute with audio graph
    dsp.setMuted(true);
    expect(dsp.isMuted()).toBe(true);

    dsp.setMuted(false);
    expect(dsp.isMuted()).toBe(false);

    // Dispose
    dsp.dispose();
    expect(dsp.getAudioContext()).toBeNull();
    // Test media element attach & detach
    const mockVideoEl = {} as HTMLMediaElement;
    dsp.attachMediaElement(mockVideoEl);
    dsp.detachMediaElement();
  });
});
