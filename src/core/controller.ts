import type {
  IMediaController,
  PlayerState,
  MediaItem,
  AspectRatio,
  RepeatMode,
  AudioTrack,
  SubtitleTrack,
  SubtitleCue,
} from './types';
import { EventEmitter } from './events';
import { VideoEngine } from '../engine/video';

export interface MediaControllerOptions {
  videoEngine?: VideoEngine;
  onSaveResumePosition?: (item: MediaItem, position: number, duration: number) => void;
  initialState?: Partial<PlayerState>;
}

export class MediaController extends EventEmitter implements IMediaController {
  private state: PlayerState;
  private videoEngine: VideoEngine | null = null;
  private onSaveResumePosition?: (item: MediaItem, position: number, duration: number) => void;
  private resumeSaveInterval: number | null = null;
  private originalQueue: MediaItem[] = [];

  constructor(options?: MediaControllerOptions) {
    super();

    this.videoEngine = options?.videoEngine || null;
    this.onSaveResumePosition = options?.onSaveResumePosition;

    this.state = {
      status: 'idle',
      currentTime: 0,
      duration: 0,
      buffered: 0,
      volume: 1.0,
      muted: false,
      playbackRate: 1.0,
      aspectRatio: 'contain',
      currentMedia: null,
      audioTracks: [],
      selectedAudioTrackId: null,
      subtitleTracks: [],
      selectedSubtitleTrackId: null,
      subtitleOffset: 0,
      activeCues: [],
      repeatMode: 'off',
      shuffle: false,
      queue: [],
      queueIndex: -1,
      ...options?.initialState,
    };

    this.startResumeTracking();
  }

  public getState(): PlayerState {
    return { ...this.state };
  }

  public async load(media: MediaItem | string, autoPlay: boolean = true): Promise<void> {
    const item: MediaItem =
      typeof media === 'string'
        ? {
            id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            uri: media,
            title: media.split('/').pop()?.split('?')[0] || 'Unknown Media',
            duration: 0,
            addedAt: Date.now(),
          }
        : media;

    this.state.status = 'loading';
    this.state.currentMedia = item;
    this.state.currentTime = 0;
    this.state.duration = item.duration || 0;
    this.state.buffered = 0;
    this.state.errorMessage = undefined;

    // Check if item is already in queue; if not, add it
    const existingIndex = this.state.queue.findIndex((q) => q.uri === item.uri);
    if (existingIndex >= 0) {
      this.state.queueIndex = existingIndex;
    } else {
      this.state.queue.push(item);
      this.state.queueIndex = this.state.queue.length - 1;
      this.originalQueue = [...this.state.queue];
    }

    this.emit('statuschange', 'loading');
    this.emit('mediachange', item);
    this.emit('statechange', this.getState());

    const videoEl = this.videoEngine?.getVideoElement();
    if (videoEl) {
      videoEl.src = item.uri;
      videoEl.load();

      if (autoPlay) {
        try {
          await videoEl.play();
          this.state.status = 'playing';
          this.emit('statuschange', 'playing');
        } catch {
          this.state.status = 'paused';
          this.emit('statuschange', 'paused');
        }
      } else {
        this.state.status = 'paused';
        this.emit('statuschange', 'paused');
      }
    } else {
      // Headless / Mock environment simulation
      this.state.status = autoPlay ? 'playing' : 'paused';
      this.emit('statuschange', this.state.status);
    }

    this.emit('statechange', this.getState());
  }

  public async play(): Promise<void> {
    if (this.state.status === 'playing') return;

    const videoEl = this.videoEngine?.getVideoElement();
    if (videoEl) {
      try {
        await videoEl.play();
        this.state.status = 'playing';
        this.emit('statuschange', 'playing');
        this.emit('statechange', this.getState());
      } catch (err) {
        this.state.status = 'error';
        this.state.errorMessage = err instanceof Error ? err.message : String(err);
        this.emit('error', { message: this.state.errorMessage, error: err });
        this.emit('statuschange', 'error');
        this.emit('statechange', this.getState());
      }
    } else {
      this.state.status = 'playing';
      this.emit('statuschange', 'playing');
      this.emit('statechange', this.getState());
    }
  }

  public pause(): void {
    if (this.state.status === 'paused') return;

    const videoEl = this.videoEngine?.getVideoElement();
    if (videoEl) {
      videoEl.pause();
    }
    this.state.status = 'paused';
    this.emit('statuschange', 'paused');
    this.emit('statechange', this.getState());
  }

  public async togglePlay(): Promise<void> {
    if (this.state.status === 'playing') {
      this.pause();
    } else {
      await this.play();
    }
  }

  public seek(position: number): void {
    const clamped = Math.max(0, Math.min(position, this.state.duration || Infinity));
    this.state.currentTime = clamped;

    const videoEl = this.videoEngine?.getVideoElement();
    if (videoEl) {
      videoEl.currentTime = clamped;
    }

    this.emit('timeupdate', {
      currentTime: clamped,
      duration: this.state.duration,
      buffered: this.state.buffered,
    });
    this.emit('statechange', this.getState());
  }

  public seekRelative(delta: number): void {
    this.seek(this.state.currentTime + delta);
  }

  public stop(): void {
    this.pause();
    this.seek(0);
    this.state.status = 'idle';
    this.emit('statuschange', 'idle');
    this.emit('statechange', this.getState());
  }

  public release(): void {
    this.stop();
    if (this.resumeSaveInterval !== null) {
      clearInterval(this.resumeSaveInterval);
      this.resumeSaveInterval = null;
    }
    this.removeAllListeners();
    this.videoEngine?.detach();
  }

  public setVolume(volume: number): void {
    // Clamp between 0.0 and 2.0 (volume boost)
    const clamped = Math.max(0.0, Math.min(volume, 2.0));
    this.state.volume = clamped;
    if (clamped > 0 && this.state.muted) {
      this.state.muted = false;
    }

    const videoEl = this.videoEngine?.getVideoElement();
    if (videoEl) {
      videoEl.volume = Math.min(1.0, clamped);
      videoEl.muted = this.state.muted;
    }

    this.emit('volumechange', { volume: clamped, muted: this.state.muted });
    this.emit('statechange', this.getState());
  }

  public toggleMute(): void {
    this.state.muted = !this.state.muted;

    const videoEl = this.videoEngine?.getVideoElement();
    if (videoEl) {
      videoEl.muted = this.state.muted;
    }

    this.emit('volumechange', { volume: this.state.volume, muted: this.state.muted });
    this.emit('statechange', this.getState());
  }

  public setPlaybackRate(rate: number): void {
    const clamped = Math.max(0.25, Math.min(rate, 4.0));
    this.state.playbackRate = clamped;

    const videoEl = this.videoEngine?.getVideoElement();
    if (videoEl) {
      videoEl.playbackRate = clamped;
    }

    this.emit('ratechange', clamped);
    this.emit('statechange', this.getState());
  }

  public setAspectRatio(ratio: AspectRatio): void {
    this.state.aspectRatio = ratio;
    this.videoEngine?.setAspectRatio(ratio);
    this.emit('aspectratiochange', ratio);
    this.emit('statechange', this.getState());
  }

  public stepFrame(forward: boolean = true): void {
    this.videoEngine?.stepFrame(forward);
  }

  public setAudioTrack(trackId: string | null): void {
    this.state.selectedAudioTrackId = trackId;
    this.emit('audiotrackselected', trackId);
    this.emit('statechange', this.getState());
  }

  public setSubtitleTrack(trackId: string | null): void {
    this.state.selectedSubtitleTrackId = trackId;
    this.emit('subtitletrackselected', trackId);
    this.emit('statechange', this.getState());
  }

  public setSubtitleOffset(offsetSeconds: number): void {
    this.state.subtitleOffset = offsetSeconds;
    this.emit('subtitleoffsetchange', offsetSeconds);
    this.emit('statechange', this.getState());
  }

  public setAudioTracks(tracks: AudioTrack[]): void {
    this.state.audioTracks = [...tracks];
    if (!this.state.selectedAudioTrackId && tracks.length > 0) {
      const defaultTrack = tracks.find((t) => t.isDefault) || tracks[0];
      this.state.selectedAudioTrackId = defaultTrack.id;
    }
    this.emit('audiotrackschange', this.state.audioTracks);
    this.emit('statechange', this.getState());
  }

  public setSubtitleTracks(tracks: SubtitleTrack[]): void {
    this.state.subtitleTracks = [...tracks];
    if (!this.state.selectedSubtitleTrackId) {
      const defaultTrack = tracks.find((t) => t.isDefault);
      if (defaultTrack) {
        this.state.selectedSubtitleTrackId = defaultTrack.id;
      }
    }
    this.emit('subtitletrackschange', this.state.subtitleTracks);
    this.emit('statechange', this.getState());
  }

  public setActiveCues(cues: SubtitleCue[]): void {
    this.state.activeCues = cues;
    this.emit('cuechange', cues);
  }

  public setQueue(items: MediaItem[], startIndex: number = 0): void {
    this.originalQueue = [...items];
    if (this.state.shuffle) {
      this.state.queue = this.shuffleArray([...items]);
    } else {
      this.state.queue = [...items];
    }
    this.state.queueIndex = Math.max(-1, Math.min(startIndex, this.state.queue.length - 1));
    this.emit('queuechange', { queue: this.state.queue, index: this.state.queueIndex });

    if (this.state.queueIndex >= 0 && this.state.queueIndex < this.state.queue.length) {
      this.load(this.state.queue[this.state.queueIndex]);
    }
  }

  public addToQueue(item: MediaItem): void {
    this.originalQueue.push(item);
    this.state.queue.push(item);
    this.emit('queuechange', { queue: this.state.queue, index: this.state.queueIndex });
    this.emit('statechange', this.getState());
  }

  public removeFromQueue(index: number): void {
    if (index < 0 || index >= this.state.queue.length) return;
    const removedItem = this.state.queue[index];
    this.state.queue.splice(index, 1);
    this.originalQueue = this.originalQueue.filter((i) => i.id !== removedItem.id);

    if (index < this.state.queueIndex) {
      this.state.queueIndex--;
    } else if (index === this.state.queueIndex) {
      if (this.state.queueIndex >= this.state.queue.length) {
        this.state.queueIndex = this.state.queue.length - 1;
      }
      if (this.state.queueIndex >= 0) {
        this.load(this.state.queue[this.state.queueIndex]);
      } else {
        this.stop();
        this.state.currentMedia = null;
        this.emit('mediachange', null);
      }
    }

    this.emit('queuechange', { queue: this.state.queue, index: this.state.queueIndex });
    this.emit('statechange', this.getState());
  }

  public async next(): Promise<void> {
    if (this.state.queue.length === 0) return;

    if (this.state.repeatMode === 'one') {
      this.seek(0);
      await this.play();
      return;
    }

    const nextIndex = this.state.queueIndex + 1;
    if (nextIndex < this.state.queue.length) {
      this.state.queueIndex = nextIndex;
      await this.load(this.state.queue[nextIndex]);
    } else if (this.state.repeatMode === 'all') {
      this.state.queueIndex = 0;
      await this.load(this.state.queue[0]);
    } else {
      this.state.status = 'ended';
      this.emit('statuschange', 'ended');
      this.emit('statechange', this.getState());
    }
  }

  public async previous(): Promise<void> {
    if (this.state.queue.length === 0) return;

    // If more than 3s into playback, seek back to beginning first
    if (this.state.currentTime > 3) {
      this.seek(0);
      return;
    }

    const prevIndex = this.state.queueIndex - 1;
    if (prevIndex >= 0) {
      this.state.queueIndex = prevIndex;
      await this.load(this.state.queue[prevIndex]);
    } else if (this.state.repeatMode === 'all') {
      this.state.queueIndex = this.state.queue.length - 1;
      await this.load(this.state.queue[this.state.queueIndex]);
    } else {
      this.seek(0);
    }
  }

  public setRepeatMode(mode: RepeatMode): void {
    this.state.repeatMode = mode;
    this.emit('repeatmodechange', mode);
    this.emit('statechange', this.getState());
  }

  public setShuffle(enabled: boolean): void {
    this.state.shuffle = enabled;
    const currentItem = this.state.currentMedia;

    if (enabled) {
      this.state.queue = this.shuffleArray([...this.originalQueue]);
      if (currentItem) {
        this.state.queueIndex = this.state.queue.findIndex((i) => i.id === currentItem.id);
      }
    } else {
      this.state.queue = [...this.originalQueue];
      if (currentItem) {
        this.state.queueIndex = this.state.queue.findIndex((i) => i.id === currentItem.id);
      }
    }

    this.emit('shufflechange', enabled);
    this.emit('queuechange', { queue: this.state.queue, index: this.state.queueIndex });
    this.emit('statechange', this.getState());
  }

  public updateTime(currentTime: number, duration?: number, buffered?: number): void {
    this.state.currentTime = currentTime;
    if (typeof duration === 'number' && duration > 0) {
      this.state.duration = duration;
    }
    if (typeof buffered === 'number') {
      this.state.buffered = buffered;
    }

    this.emit('timeupdate', {
      currentTime: this.state.currentTime,
      duration: this.state.duration,
      buffered: this.state.buffered,
    });
  }

  private startResumeTracking(): void {
    if (typeof setInterval === 'undefined') return;
    this.resumeSaveInterval = setInterval(() => {
      if (
        this.state.status === 'playing' &&
        this.state.currentMedia &&
        this.state.currentTime > 5 &&
        this.onSaveResumePosition
      ) {
        this.onSaveResumePosition(
          this.state.currentMedia,
          this.state.currentTime,
          this.state.duration
        );
      }
    }, 5000) as unknown as number;
  }

  private shuffleArray(array: MediaItem[]): MediaItem[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled;
  }
}
