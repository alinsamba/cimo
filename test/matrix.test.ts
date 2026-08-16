import { describe, expect, it } from 'bun:test';
import { parseMediaProfile, detectContainerAndProtocol } from '../src/engine/matrix';

describe('Media Matrix & Profile Parser', () => {
  it('detects network stream protocols and adaptive formats', () => {
    const hls = detectContainerAndProtocol('https://live.example.com/playlist.m3u8');
    expect(hls.protocol).toBe('hls');
    expect(hls.container).toBe('ts');

    const dash = detectContainerAndProtocol('http://cdn.example.com/manifest.mpd');
    expect(dash.protocol).toBe('dash');
    expect(dash.container).toBe('mp4');

    const rtsp = detectContainerAndProtocol('rtsp://camera.local:554/live');
    expect(rtsp.protocol).toBe('rtsp');
  });

  it('identifies modern video codecs, HDR10, and Dolby Vision', () => {
    const dvProfile = parseMediaProfile('Movie.2024.2160p.DV.HDR.HEVC.Atmos.mkv');
    expect(dvProfile.container).toBe('mkv');
    expect(dvProfile.videoCodec).toBe('hevc');
    expect(dvProfile.audioCodec).toBe('truehd'); // Atmos
    expect(dvProfile.isHDR).toBe(true);
    expect(dvProfile.hdrType).toBe('dolby_vision');
    expect(dvProfile.colorSpace).toBe('bt2020');
    expect(dvProfile.recommendedDecoder).toBe('hardware');
  });

  it('flags 10-bit H.264 (Hi10P) for software CPU fallback', () => {
    const hi10pProfile = parseMediaProfile('Anime.Episode.01.1080p.Hi10P.x264.FLAC.mkv');
    expect(hi10pProfile.videoCodec).toBe('h264');
    expect(hi10pProfile.isHi10P).toBe(true);
    expect(hi10pProfile.recommendedDecoder).toBe('software');
    expect(hi10pProfile.audioCodec).toBe('flac');
  });

  it('detects professional video editing formats (ProRes & DNxHD)', () => {
    const prores = parseMediaProfile('/Volumes/Media/Footage_ProRes422.mov');
    expect(prores.container).toBe('mov');
    expect(prores.videoCodec).toBe('prores');
    expect(prores.recommendedDecoder).toBe('software');

    const dnxhd = parseMediaProfile('C:\\Renders\\Clip_DNxHD.mkv');
    expect(dnxhd.videoCodec).toBe('dnxhd');
  });

  it('detects lossless high-resolution audio codecs (FLAC, ALAC, DSD)', () => {
    const dsd = parseMediaProfile('Track01.dsf');
    expect(dsd.container).toBe('dsf');
    expect(dsd.audioCodec).toBe('dsd');

    const flac = parseMediaProfile('Album/01-Intro.flac');
    expect(flac.audioCodec).toBe('flac');
  });
});
