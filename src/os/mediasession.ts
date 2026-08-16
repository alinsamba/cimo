import type { IMediaController, MediaItem, PlayerState } from '../core/types';
import type { EventEmitter, UnsubscribeFn } from '../core/events';
import { getMimeType } from './associations';

export type MediaSessionPlaybackState = 'none' | 'paused' | 'playing';

export type MediaSessionAction =
  | 'play'
  | 'pause'
  | 'seekbackward'
  | 'seekforward'
  | 'previoustrack'
  | 'nexttrack'
  | 'stop'
  | 'seekto'
  | 'skipad';

export interface MediaSessionArtwork {
  readonly src: string;
  readonly sizes?: string;
  readonly type?: string;
}

export interface MediaMetadataInit {
  readonly title?: string;
  readonly artist?: string;
  readonly album?: string;
  readonly artwork?: readonly MediaSessionArtwork[];
}

export interface MediaSessionActionDetails {
  readonly action: MediaSessionAction;
  readonly seekOffset?: number;
  readonly seekTime?: number;
  readonly fastSeek?: boolean;
}

export type MediaSessionActionHandler = (details: MediaSessionActionDetails) => void;

export interface MediaPositionState {
  duration?: number;
  playbackRate?: number;
  position?: number;
}

export interface INavigatorMediaSession {
  metadata: MediaMetadataInit | null;
  playbackState: MediaSessionPlaybackState;
  setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null): void;
  setPositionState?(state?: MediaPositionState): void;
}

/**
 * Cross-platform adapter for standard navigator.mediaSession.
 */
export class MediaSessionAdapter {
  private session: INavigatorMediaSession | null = null;
  private unbindListeners: UnsubscribeFn[] = [];
  private boundController: IMediaController | null = null;
  private currentPlaybackRate = 1.0;

  constructor(customSession?: INavigatorMediaSession) {
    if (customSession) {
      this.session = customSession;
    } else if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const nav = navigator as unknown as { mediaSession?: INavigatorMediaSession };
      this.session = nav.mediaSession ?? null;
    }
  }

  /**
   * Check if MediaSession API is available in current environment.
   */
  public isSupported(): boolean {
    return this.session !== null;
  }

  /**
   * Get underlying media session target.
   */
  public getSession(): INavigatorMediaSession | null {
    return this.session;
  }

  /**
   * Set or override the media session target.
   */
  public setSession(session: INavigatorMediaSession | null): void {
    this.session = session;
  }

  /**
   * Bind to controller and event emitter to automatically sync state and handle user actions.
   */
  public bind(controller: IMediaController, events: EventEmitter): UnsubscribeFn {
    this.unbind();
    this.boundController = controller;

    this.registerActionHandlers(controller);

    // Initial sync
    const initialState = controller.getState();
    this.updateFromPlayerState(initialState);

    const onStateChange = (state: PlayerState) => {
      this.updateFromPlayerState(state);
    };

    const onStatusChange = (status: PlayerState['status']) => {
      this.setPlaybackState(this.mapStatusToPlaybackState(status));
    };

    const onMediaChange = (media: MediaItem | null) => {
      this.updateMetadata(media);
    };

    const onTimeUpdate = (data: { currentTime: number; duration: number; buffered: number }) => {
      this.setPositionState({
        duration: data.duration,
        position: data.currentTime,
        playbackRate: this.currentPlaybackRate,
      });
    };

    const onRateChange = (rate: number) => {
      this.currentPlaybackRate = rate;
      const state = controller.getState();
      this.setPositionState({
        duration: state.duration,
        position: state.currentTime,
        playbackRate: rate,
      });
    };

    this.unbindListeners = [
      events.on('statechange', onStateChange),
      events.on('statuschange', onStatusChange),
      events.on('mediachange', onMediaChange),
      events.on('timeupdate', onTimeUpdate),
      events.on('ratechange', onRateChange),
    ];

    return () => {
      this.unbind();
    };
  }

  /**
   * Unbind all event listeners and action handlers.
   */
  public unbind(): void {
    for (const unsubscribe of this.unbindListeners) {
      unsubscribe();
    }
    this.unbindListeners = [];
    this.clearActionHandlers();
    this.boundController = null;
  }

  /**
   * Update MediaSession metadata from a MediaItem.
   */
  public updateMetadata(media: MediaItem | null): void {
    if (!this.session) {
      return;
    }

    if (!media) {
      this.session.metadata = null;
      return;
    }

    const title = media.title || media.metadata?.title || 'Unknown Title';
    const artist = media.artist || media.metadata?.artist || '';
    const album = media.album || media.metadata?.album || '';
    const artworkUrl = media.thumbnail || media.metadata?.artwork;

    const artwork: MediaSessionArtwork[] = [];
    if (artworkUrl) {
      const mime = getMimeType(artworkUrl) || (artworkUrl.startsWith('data:image/') ? artworkUrl.slice(5, artworkUrl.indexOf(';')) : 'image/jpeg');
      artwork.push({
        src: artworkUrl,
        sizes: '512x512',
        type: mime,
      });
    }

    const metadataInit: MediaMetadataInit = {
      title,
      artist,
      album,
      artwork,
    };

    // If global MediaMetadata constructor exists in browser runtime, instantiate it
    const globalScope = globalThis as unknown as { MediaMetadata?: new (init: MediaMetadataInit) => MediaMetadataInit };
    if (typeof globalScope.MediaMetadata === 'function') {
      try {
        this.session.metadata = new globalScope.MediaMetadata(metadataInit);
        return;
      } catch {
        // Fallback to plain object
      }
    }

    this.session.metadata = metadataInit;
  }

  /**
   * Update playback state ('none' | 'paused' | 'playing').
   */
  public setPlaybackState(state: MediaSessionPlaybackState): void {
    if (!this.session) {
      return;
    }
    try {
      this.session.playbackState = state;
    } catch (err: unknown) {
      console.warn('Failed to set MediaSession playbackState:', err);
    }
  }

  /**
   * Update position state for timeline scrubbing in OS HUD.
   */
  public setPositionState(state: MediaPositionState): void {
    if (!this.session || typeof this.session.setPositionState !== 'function') {
      return;
    }

    const duration = state.duration ?? 0;
    const position = state.position ?? 0;
    const playbackRate = state.playbackRate ?? 1.0;

    // MediaSession specification requires finite non-negative values and position <= duration
    if (!Number.isFinite(duration) || duration <= 0) {
      return;
    }

    const validPosition = Number.isFinite(position) ? Math.max(0, Math.min(position, duration)) : 0;
    const validRate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1.0;

    try {
      this.session.setPositionState({
        duration,
        position: validPosition,
        playbackRate: validRate,
      });
    } catch {
      // Ignored if browser state is temporarily inconsistent
    }
  }

  /**
   * Synchronize all properties from a full PlayerState snapshot.
   */
  public updateFromPlayerState(state: PlayerState): void {
    this.currentPlaybackRate = state.playbackRate;
    this.updateMetadata(state.currentMedia);
    this.setPlaybackState(this.mapStatusToPlaybackState(state.status));
    this.setPositionState({
      duration: state.duration,
      position: state.currentTime,
      playbackRate: state.playbackRate,
    });
  }

  /**
   * Map PlayerState status to MediaSessionPlaybackState.
   */
  public mapStatusToPlaybackState(status: PlayerState['status']): MediaSessionPlaybackState {
    switch (status) {
      case 'playing':
      case 'buffering':
      case 'loading':
        return 'playing';
      case 'paused':
        return 'paused';
      case 'idle':
      case 'ended':
      case 'error':
      default:
        return 'none';
    }
  }

  /**
   * Register action handlers mapping OS Media controls to controller methods.
   */
  private registerActionHandlers(controller: IMediaController): void {
    if (!this.session) {
      return;
    }

    const actions: Array<{
      action: MediaSessionAction;
      handler: MediaSessionActionHandler;
    }> = [
      {
        action: 'play',
        handler: () => {
          controller.play().catch(() => {});
        },
      },
      {
        action: 'pause',
        handler: () => {
          controller.pause();
        },
      },
      {
        action: 'seekbackward',
        handler: (details) => {
          const delta = details.seekOffset ?? 10;
          controller.seekRelative(-delta);
        },
      },
      {
        action: 'seekforward',
        handler: (details) => {
          const delta = details.seekOffset ?? 10;
          controller.seekRelative(delta);
        },
      },
      {
        action: 'previoustrack',
        handler: () => {
          controller.previous().catch(() => {});
        },
      },
      {
        action: 'nexttrack',
        handler: () => {
          controller.next().catch(() => {});
        },
      },
      {
        action: 'stop',
        handler: () => {
          controller.stop();
        },
      },
      {
        action: 'seekto',
        handler: (details) => {
          if (details.seekTime !== undefined && Number.isFinite(details.seekTime)) {
            controller.seek(details.seekTime);
          }
        },
      },
    ];

    for (const { action, handler } of actions) {
      try {
        this.session.setActionHandler(action, handler);
      } catch {
        // Some browsers or webviews might not support certain actions
      }
    }
  }

  /**
   * Clear all registered action handlers on the session.
   */
  private clearActionHandlers(): void {
    if (!this.session) {
      return;
    }

    const actions: MediaSessionAction[] = [
      'play',
      'pause',
      'seekbackward',
      'seekforward',
      'previoustrack',
      'nexttrack',
      'stop',
      'seekto',
    ];

    for (const action of actions) {
      try {
        this.session.setActionHandler(action, null);
      } catch {
        // Ignore
      }
    }
  }
}
