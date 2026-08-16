export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error';

export type AspectRatio = 'contain' | 'cover' | 'fill' | '16:9' | '4:3' | '21:9' | 'original';

export type RepeatMode = 'off' | 'all' | 'one';

export interface AudioTrack {
  id: string;
  label: string;
  language?: string;
  channels?: number;
  codec?: string;
  isDefault?: boolean;
}

export interface SubtitleCue {
  id?: string;
  startTime: number; // in seconds
  endTime: number;   // in seconds
  text: string;
  rawText?: string;
  style?: {
    color?: string;
    fontSize?: string;
    fontFamily?: string;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    alignment?: 'top-left' | 'top-center' | 'top-right' | 'mid-left' | 'mid-center' | 'mid-right' | 'bot-left' | 'bot-center' | 'bot-right';
    marginV?: number;
    marginH?: number;
  };
}

export interface SubtitleTrack {
  id: string;
  label: string;
  language?: string;
  format: 'srt' | 'vtt' | 'ass' | 'embedded';
  cues: SubtitleCue[];
  isDefault?: boolean;
}

export interface MediaMetadata {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  width?: number;
  height?: number;
  resolution?: string;
  format?: string;
  bitrate?: number;
  audioChannels?: number;
  fileSize?: number;
  path?: string;
}

export interface MediaItem {
  id: string;
  uri: string;
  path?: string;
  title: string;
  artist?: string;
  album?: string;
  duration: number;
  thumbnail?: string;
  metadata?: MediaMetadata;
  addedAt: number;
}

export interface PlaybackHistoryItem {
  id: string;
  mediaId: string;
  uri: string;
  title: string;
  position: number;
  duration: number;
  completed: boolean;
  lastPlayedAt: number;
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  itemCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface EqualizerBand {
  frequency: number; // Hz (e.g. 32, 64, 125, 250, 500, 1k, 2k, 4k, 8k, 16k)
  gain: number;      // dB (-12 to +12)
  q?: number;
}

export interface EqualizerPreset {
  name: string;
  gains: number[]; // 10 bands gains in dB
}

export interface PlayerState {
  status: PlaybackStatus;
  currentTime: number;
  duration: number;
  buffered: number;
  volume: number; // 0.0 - 2.0 (supports up to 200% volume boost)
  muted: boolean;
  playbackRate: number; // 0.25 - 4.0
  aspectRatio: AspectRatio;
  currentMedia: MediaItem | null;
  audioTracks: AudioTrack[];
  selectedAudioTrackId: string | null;
  subtitleTracks: SubtitleTrack[];
  selectedSubtitleTrackId: string | null;
  subtitleOffset: number; // in seconds (delay/advance)
  activeCues: SubtitleCue[];
  repeatMode: RepeatMode;
  shuffle: boolean;
  queue: MediaItem[];
  queueIndex: number;
  errorMessage?: string;
}

export interface IMediaController {
  // State
  getState(): PlayerState;
  
  // Playback lifecycle
  load(media: MediaItem | string, autoPlay?: boolean): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  togglePlay(): Promise<void>;
  seek(position: number): void;
  seekRelative(delta: number): void;
  stop(): void;
  release(): void;
  
  // Playback settings
  setVolume(volume: number): void; // 0.0 to 2.0
  toggleMute(): void;
  setPlaybackRate(rate: number): void;
  setAspectRatio(ratio: AspectRatio): void;
  stepFrame(forward?: boolean): void;
  
  // Track selection
  setAudioTrack(trackId: string | null): void;
  setSubtitleTrack(trackId: string | null): void;
  setSubtitleOffset(offsetSeconds: number): void;
  
  // Queue & Playlist
  setQueue(items: MediaItem[], startIndex?: number): void;
  addToQueue(item: MediaItem): void;
  removeFromQueue(index: number): void;
  next(): Promise<void>;
  previous(): Promise<void>;
  setRepeatMode(mode: RepeatMode): void;
  setShuffle(enabled: boolean): void;
}
