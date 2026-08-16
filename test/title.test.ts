import { describe, expect, it } from 'bun:test';
import { parseMediaDisplayTitle } from '../src/core/title';

describe('parseMediaDisplayTitle', () => {
  it('cleans download titles while preserving artist, song name, and (Lyrics)', () => {
    const result = parseMediaDisplayTitle('DaBaby - Intro (Lyrics) (720p, h264).mp4');
    expect(result.cleanTitle).toBe('DaBaby - Intro (Lyrics)');
    expect(result.badges).toContain('720p');
    expect(result.badges).toContain('H.264');
  });

  it('cleans scene releases with dots and codec tags', () => {
    const result = parseMediaDisplayTitle('Cyberpunk.Edgerunners.S01E01.1080p.WEBRip.x264.AAC-[YTS].mkv');
    expect(result.cleanTitle).toBe('Cyberpunk Edgerunners S01E01');
    expect(result.badges).toContain('1080p');
    expect(result.badges).toContain('H.264');
    expect(result.badges).toContain('WEB');
    expect(result.badges).toContain('AAC');
  });

  it('extracts 4K, HDR, HEVC, and Atmos from modern movie files and formats year', () => {
    const result = parseMediaDisplayTitle('Dune.Part.Two.2024.2160p.UHD.HDR.HEVC.Atmos-FLUX.mp4');
    expect(result.cleanTitle).toContain('Dune Part Two (2024)');
    expect(result.badges).toContain('4K');
    expect(result.badges).toContain('HDR');
    expect(result.badges).toContain('HEVC');
    expect(result.badges).toContain('Atmos');
  });

  it('preserves clean parenthesized years while stripping bracketed tags', () => {
    const result = parseMediaDisplayTitle('Inception (2010) [1080p, x265].mkv');
    expect(result.cleanTitle).toBe('Inception (2010)');
    expect(result.badges).toContain('1080p');
    expect(result.badges).toContain('HEVC');
  });

  it('handles basic file names gracefully', () => {
    const result = parseMediaDisplayTitle('sample_video.mp4');
    expect(result.cleanTitle).toBe('sample video');
  });
});
