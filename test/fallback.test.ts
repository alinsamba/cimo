import { describe, expect, it } from 'bun:test';
import { DecodingFallbackManager } from '../src/engine/fallback';
import { parseMediaProfile } from '../src/engine/matrix';

describe('DecodingFallbackManager', () => {
  it('probes GPU hardware decoder for standard 4K HEVC and AV1', async () => {
    const manager = new DecodingFallbackManager();
    const profile = parseMediaProfile('Video_4K_HEVC.mp4');

    const result = await manager.probeDecoderCapability(profile);
    expect(result.tier).toBe('hardware-gpu');
    expect(result.isHardwareAccelerated).toBe(true);
    expect(result.supported).toBe(true);
  });

  it('routes Hi10P directly to software CPU decoding', async () => {
    const manager = new DecodingFallbackManager();
    const profile = parseMediaProfile('Anime_Hi10P_10bit.mkv');

    const result = await manager.probeDecoderCapability(profile);
    expect(result.tier).toBe('software-cpu');
    expect(result.isHardwareAccelerated).toBe(false);
    expect(result.fallbackReason).toContain('Hi10P');
  });

  it('handles runtime fallback transitions and notifies listeners', () => {
    const manager = new DecodingFallbackManager();
    let triggeredTier = '';
    let triggeredReason = '';

    manager.onFallback((tier, reason) => {
      triggeredTier = tier;
      triggeredReason = reason;
    });

    manager.triggerFallback('Direct3D 11 Surface decode error 0x887A0005');
    expect(manager.getCurrentTier()).toBe('software-cpu');
    expect(triggeredTier).toBe('software-cpu');
    expect(triggeredReason).toContain('Direct3D 11');
  });
});
