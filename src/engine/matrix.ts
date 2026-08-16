export type VideoCodecType =
  | 'av01' // AV1
  | 'hevc' // H.265 / HEVC
  | 'h264' // H.264 / AVC
  | 'vp09' // VP9
  | 'vp08' // VP8
  | 'mpeg2'
  | 'mpeg4'
  | 'vc1'
  | 'theora'
  | 'prores'
  | 'dnxhd'
  | 'cineform'
  | 'unknown';

export type AudioCodecType =
  | 'aac'
  | 'mp3'
  | 'opus'
  | 'vorbis'
  | 'ac3'
  | 'eac3'
  | 'dts'
  | 'dtshd'
  | 'truehd'
  | 'flac'
  | 'alac'
  | 'pcm'
  | 'wavpack'
  | 'ape'
  | 'dsd'
  | 'unknown';

export type ContainerType =
  | 'mkv'
  | 'mp4'
  | 'mov'
  | 'webm'
  | 'avi'
  | 'ts'
  | 'm2ts'
  | 'vob'
  | 'ogg'
  | 'flv'
  | 'wmv'
  | 'asf'
  | '3gp'
  | 'wav'
  | 'aiff'
  | 'flac'
  | 'm4a'
  | 'aac'
  | 'dsf'
  | 'dff'
  | 'unknown';

export type HDRType = 'sdr' | 'hdr10' | 'hdr10_plus' | 'hlg' | 'dolby_vision';

export type StreamProtocol = 'file' | 'http' | 'https' | 'hls' | 'dash' | 'rtsp' | 'rtmp' | 'smb' | 'nfs';

export interface CodecInfo {
  codec: VideoCodecType | AudioCodecType;
  label: string;
  isLossless?: boolean;
  isPro?: boolean;
  requiresSoftwareFallback?: boolean;
}

export interface MediaProfileInfo {
  container: ContainerType;
  protocol: StreamProtocol;
  videoCodec?: VideoCodecType;
  audioCodec?: AudioCodecType;
  isHDR: boolean;
  hdrType: HDRType;
  colorDepth: 8 | 10 | 12;
  colorSpace: 'bt709' | 'bt2020' | 'srgb' | 'dci-p3';
  isSurround: boolean;
  audioChannels: number;
  isHi10P: boolean;
  recommendedDecoder: 'hardware' | 'software';
}

const CONTAINER_EXT_MAP: Record<string, ContainerType> = {
  mkv: 'mkv',
  mp4: 'mp4',
  m4v: 'mp4',
  mov: 'mov',
  qt: 'mov',
  webm: 'webm',
  avi: 'avi',
  ts: 'ts',
  m2ts: 'm2ts',
  mts: 'm2ts',
  vob: 'vob',
  ogg: 'ogg',
  ogv: 'ogg',
  oga: 'ogg',
  flv: 'flv',
  wmv: 'wmv',
  asf: 'asf',
  '3gp': '3gp',
  wav: 'wav',
  aiff: 'aiff',
  aif: 'aiff',
  flac: 'flac',
  m4a: 'm4a',
  aac: 'aac',
  dsf: 'dsf',
  dff: 'dff',
};

export function detectContainerAndProtocol(uri: string): { container: ContainerType; protocol: StreamProtocol } {
  const urlLower = uri.toLowerCase().split('?')[0];

  let protocol: StreamProtocol = 'file';
  if (urlLower.startsWith('http://')) protocol = 'http';
  else if (urlLower.startsWith('https://')) protocol = 'https';
  else if (urlLower.startsWith('rtsp://')) protocol = 'rtsp';
  else if (urlLower.startsWith('rtmp://')) protocol = 'rtmp';
  else if (urlLower.startsWith('smb://')) protocol = 'smb';
  else if (urlLower.startsWith('nfs://')) protocol = 'nfs';

  if (urlLower.endsWith('.m3u8')) return { container: 'ts', protocol: 'hls' };
  if (urlLower.endsWith('.mpd')) return { container: 'mp4', protocol: 'dash' };

  const ext = urlLower.split('.').pop() || '';
  const container = CONTAINER_EXT_MAP[ext] || 'unknown';

  return { container, protocol };
}

export function parseMediaProfile(filenameOrUri: string, metadata?: {
  width?: number;
  height?: number;
  audioChannels?: number;
  format?: string;
}): MediaProfileInfo {
  const { container, protocol } = detectContainerAndProtocol(filenameOrUri);
  const text = filenameOrUri.toLowerCase();

  // 1. Video Codec Detection
  let videoCodec: VideoCodecType = 'unknown';
  let isHi10P = false;

  if (/av1|av01/i.test(text)) videoCodec = 'av01';
  else if (/hevc|h265|x265/i.test(text)) videoCodec = 'hevc';
  else if (/hi10p/i.test(text)) {
    videoCodec = 'h264';
    isHi10P = true;
  } else if (/h264|x264|avc/i.test(text)) {
    videoCodec = 'h264';
    if (/10bit|10-bit/i.test(text)) {
      isHi10P = true;
    }
  } else if (/vp9|vp09/i.test(text)) videoCodec = 'vp09';
  else if (/vp8|vp08/i.test(text)) videoCodec = 'vp08';
  else if (/prores/i.test(text)) videoCodec = 'prores';
  else if (/dnxhd|dnxhr/i.test(text)) videoCodec = 'dnxhd';
  else if (/xvid|divx|mpeg4|mp4v/i.test(text)) videoCodec = 'mpeg4';
  else if (/mpeg2|m2v/i.test(text)) videoCodec = 'mpeg2';
  else if (/vc1|wmv3/i.test(text)) videoCodec = 'vc1';

  // 2. Audio Codec Detection
  let audioCodec: AudioCodecType = 'unknown';
  if (/atmos/i.test(text)) audioCodec = 'truehd';
  else if (/truehd/i.test(text)) audioCodec = 'truehd';
  else if (/flac/i.test(text)) audioCodec = 'flac';
  else if (/alac/i.test(text)) audioCodec = 'alac';
  else if (/opus/i.test(text)) audioCodec = 'opus';
  else if (/aac/i.test(text)) audioCodec = 'aac';
  else if (/mp3/i.test(text)) audioCodec = 'mp3';
  else if (/dts-hd|dtshd/i.test(text)) audioCodec = 'dtshd';
  else if (/dts/i.test(text)) audioCodec = 'dts';
  else if (/eac3|ddp|dd\+/i.test(text)) audioCodec = 'eac3';
  else if (/ac3|dolby/i.test(text)) audioCodec = 'ac3';
  else if (/dsd|dsf|dff/i.test(text)) audioCodec = 'dsd';
  else if (/wav|pcm/i.test(text)) audioCodec = 'pcm';
  // 3. HDR & Color Space Detection
  let isHDR = false;
  let hdrType: HDRType = 'sdr';
  let colorDepth: 8 | 10 | 12 = 8;
  let colorSpace: 'bt709' | 'bt2020' | 'srgb' | 'dci-p3' = 'bt709';

  if (/\b(dovi|dv|dolby.vision)\b/i.test(text)) {
    isHDR = true;
    hdrType = 'dolby_vision';
    colorDepth = 10;
    colorSpace = 'bt2020';
  } else if (/\b(hdr10\+|hdr10plus)\b/i.test(text)) {
    isHDR = true;
    hdrType = 'hdr10_plus';
    colorDepth = 10;
    colorSpace = 'bt2020';
  } else if (/\b(hdr10|hdr)\b/i.test(text)) {
    isHDR = true;
    hdrType = 'hdr10';
    colorDepth = 10;
    colorSpace = 'bt2020';
  } else if (/\b(hlg)\b/i.test(text)) {
    isHDR = true;
    hdrType = 'hlg';
    colorDepth = 10;
    colorSpace = 'bt2020';
  } else if (/\b(10bit|10-bit)\b/i.test(text)) {
    colorDepth = 10;
  } else if (/\b(12bit|12-bit)\b/i.test(text)) {
    colorDepth = 12;
  }

  // 4. Surround Audio Detection
  const channels = metadata?.audioChannels || (/\b(7\.1|8ch)\b/i.test(text) ? 8 : /\b(5\.1|6ch)\b/i.test(text) ? 6 : 2);
  const isSurround = channels > 2;

  // 5. Hardware vs Software Fallback Recommendation
  // Hi10P (10-bit H.264) and uncommon pro codecs recommend software decoding fallback
  const recommendedDecoder: 'hardware' | 'software' = isHi10P || videoCodec === 'prores' || videoCodec === 'dnxhd'
    ? 'software'
    : 'hardware';

  return {
    container,
    protocol,
    videoCodec: videoCodec !== 'unknown' ? videoCodec : undefined,
    audioCodec: audioCodec !== 'unknown' ? audioCodec : undefined,
    isHDR,
    hdrType,
    colorDepth,
    colorSpace,
    isSurround,
    audioChannels: channels,
    isHi10P,
    recommendedDecoder,
  };
}
