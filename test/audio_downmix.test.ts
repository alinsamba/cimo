import { describe, expect, it } from 'bun:test';
import { calculateDownmixGains } from '../src/engine/audio';

describe('Audio Downmixing Matrix & Dialogue Enhancement', () => {
  it('calculates ITU-R BS.775 downmix coefficients for 5.1 surround sound', () => {
    // 5.1 channels: [FL, FR, FC, LFE, SL, SR]
    const res = calculateDownmixGains(6, 3); // +3dB dialogue boost

    expect(res.leftGains.length).toBe(6);
    expect(res.rightGains.length).toBe(6);

    // FL goes 100% to Left, 0% to Right
    expect(res.leftGains[0]).toBe(1.0);
    expect(res.rightGains[0]).toBe(0.0);

    // FR goes 0% to Left, 100% to Right
    expect(res.leftGains[1]).toBe(0.0);
    expect(res.rightGains[1]).toBe(1.0);

    // Center channel is boosted by dialogue multiplier and split equally
    expect(res.leftGains[2]).toBeGreaterThan(0.7071);
    expect(res.rightGains[2]).toBeGreaterThan(0.7071);
    expect(res.leftGains[2]).toBe(res.rightGains[2]);

    // LFE (subwoofer) is mixed at 0.5
    expect(res.leftGains[3]).toBe(0.5);
    expect(res.rightGains[3]).toBe(0.5);
  });

  it('calculates downmix coefficients for 7.1 surround sound', () => {
    // 7.1 channels: [FL, FR, FC, LFE, BL, BR, SL, SR]
    const res = calculateDownmixGains(8, 6); // +6dB dialogue boost

    expect(res.leftGains.length).toBe(8);
    expect(res.rightGains.length).toBe(8);
    expect(res.dialogueBoostDb).toBe(6);
  });

  it('handles stereo passthrough cleanly', () => {
    const res = calculateDownmixGains(2);
    expect(res.leftGains).toEqual([1.0, 0.0]);
    expect(res.rightGains).toEqual([0.0, 1.0]);
  });
});
