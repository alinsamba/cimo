import type { PlayerState, SubtitleCue, AudioTrack, SubtitleTrack, MediaItem } from './types';

export type EventCallback<T = unknown> = (data: T) => void;
export type UnsubscribeFn = () => void;

export interface PlayerEvents {
  statechange: PlayerState;
  statuschange: PlayerState['status'];
  timeupdate: { currentTime: number; duration: number; buffered: number };
  volumechange: { volume: number; muted: boolean };
  ratechange: number;
  aspectratiochange: PlayerState['aspectRatio'];
  mediachange: MediaItem | null;
  queuechange: { queue: MediaItem[]; index: number };
  audiotrackschange: AudioTrack[];
  audiotrackselected: string | null;
  subtitletrackschange: SubtitleTrack[];
  subtitletrackselected: string | null;
  subtitleoffsetchange: number;
  cuechange: SubtitleCue[];
  repeatmodechange: PlayerState['repeatMode'];
  shufflechange: boolean;
  error: { message: string; error?: unknown };
}

export class EventEmitter {
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();

  on<K extends keyof PlayerEvents>(event: K, listener: EventCallback<PlayerEvents[K]>): UnsubscribeFn;
  on(event: string, listener: EventCallback<unknown>): UnsubscribeFn;
  on(event: string, listener: EventCallback<unknown>): UnsubscribeFn {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    const castListener = listener as EventCallback<unknown>;
    set.add(castListener);

    return () => {
      this.off(event, castListener);
    };
  }

  once<K extends keyof PlayerEvents>(event: K, listener: EventCallback<PlayerEvents[K]>): UnsubscribeFn;
  once(event: string, listener: EventCallback<unknown>): UnsubscribeFn;
  once(event: string, listener: EventCallback<unknown>): UnsubscribeFn {
    const wrapper: EventCallback<unknown> = (data: unknown) => {
      this.off(event, wrapper);
      listener(data);
    };
    return this.on(event, wrapper);
  }

  off(event: string, listener: EventCallback<unknown>): void {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  emit<K extends keyof PlayerEvents>(event: K, data: PlayerEvents[K]): void;
  emit(event: string, data?: unknown): void;
  emit(event: string, data?: unknown): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of Array.from(set)) {
        try {
          listener(data);
        } catch (err: unknown) {
          console.error(`Error in event listener for "${event}":`, err);
        }
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
