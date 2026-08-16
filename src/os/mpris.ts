import type { IMediaController, MediaItem, PlayerState, RepeatMode } from '../core/types';
import type { EventEmitter, UnsubscribeFn } from '../core/events';
import { getAllMimeTypes } from './associations';

export type MPRISPlaybackStatus = 'Playing' | 'Paused' | 'Stopped';
export type MPRISLoopStatus = 'None' | 'Track' | 'Playlist';

export interface MPRISMetadata {
  'mpris:trackid': string;
  'mpris:length'?: number; // in microseconds
  'mpris:artUrl'?: string;
  'xesam:title'?: string;
  'xesam:artist'?: string[];
  'xesam:album'?: string;
  'xesam:url'?: string;
  'xesam:userRating'?: number;
  'xesam:genre'?: string[];
  [key: string]: unknown;
}

export interface MPRISSignal {
  path: string;
  interfaceName: string;
  member: string;
  args: unknown[];
}

export interface DBusMessage {
  type: 'method_call' | 'method_return' | 'error' | 'signal';
  path?: string;
  interface?: string;
  member?: string;
  destination?: string;
  sender?: string;
  signature?: string;
  body?: unknown[];
  errorName?: string;
  errorMessage?: string;
}

export type MPRISSignalListener = (signal: MPRISSignal) => void;

/**
 * Standard D-Bus object path for "NoTrack" in MPRIS specification.
 */
export const NO_TRACK_ID = '/org/mpris/MediaPlayer2/trackList/NoTrack';

/**
 * MPRIS D-Bus interfaces.
 */
export const MPRIS_ROOT_INTERFACE = 'org.mpris.MediaPlayer2';
export const MPRIS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';
export const DBUS_PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
export const DBUS_INTROSPECTABLE_INTERFACE = 'org.freedesktop.DBus.Introspectable';

/**
 * Sanitize an identifier into a compliant D-Bus Object Path segment.
 */
export function encodeTrackId(id: string | null | undefined): string {
  if (!id) {
    return NO_TRACK_ID;
  }
  const sanitized = id.replace(/[^a-zA-Z0-9_]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`);
  return `/org/cimo/Track/${sanitized || 'default'}`;
}

/**
 * Convert seconds to microseconds for MPRIS specification.
 */
export function secondsToMicroseconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return 0;
  }
  return Math.round(seconds * 1_000_000);
}

/**
 * Convert microseconds to seconds.
 */
export function microsecondsToSeconds(microseconds: number): number {
  if (!Number.isFinite(microseconds) || microseconds < 0) {
    return 0;
  }
  return microseconds / 1_000_000;
}

/**
 * MPRIS 2.2 implementation for Linux D-Bus & IPC integration.
 */
export class MPRISService {
  // org.mpris.MediaPlayer2 properties
  public readonly identity = 'Cimo';
  public readonly desktopEntry = 'cimo';
  public readonly supportedUriSchemes: readonly string[] = ['file', 'http', 'https'];
  public readonly supportedMimeTypes: readonly string[] = getAllMimeTypes();
  public canQuit = true;
  public canRaise = true;
  public hasTrackList = false;
  public fullscreen = false;
  public canSetFullscreen = true;

  // org.mpris.MediaPlayer2.Player properties
  private playbackStatus: MPRISPlaybackStatus = 'Stopped';
  private loopStatus: MPRISLoopStatus = 'None';
  private rate = 1.0;
  private shuffle = false;
  private metadata: MPRISMetadata = {
    'mpris:trackid': NO_TRACK_ID,
  };
  private volume = 1.0;
  private positionMicroseconds = 0;
  public readonly minimumRate = 0.25;
  public readonly maximumRate = 4.0;
  public canControl = true;
  public canPlay = true;
  public canPause = true;
  public canSeek = true;
  public canGoNext = false;
  public canGoPrevious = false;

  // Internal state
  private boundController: IMediaController | null = null;
  private unbindListeners: UnsubscribeFn[] = [];
  private signalListeners: MPRISSignalListener[] = [];
  private quitHandler?: () => void;
  private raiseHandler?: () => void;

  constructor(options?: {
    quitHandler?: () => void;
    raiseHandler?: () => void;
  }) {
    this.quitHandler = options?.quitHandler;
    this.raiseHandler = options?.raiseHandler;
  }

  // --- Getters and Setters for org.mpris.MediaPlayer2.Player ---

  public get PlaybackStatus(): MPRISPlaybackStatus {
    return this.playbackStatus;
  }

  public get LoopStatus(): MPRISLoopStatus {
    return this.loopStatus;
  }

  public set LoopStatus(value: MPRISLoopStatus) {
    if (this.loopStatus !== value) {
      this.loopStatus = value;
      this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { LoopStatus: value });

      if (this.boundController) {
        let repeatMode: RepeatMode = 'off';
        if (value === 'Track') repeatMode = 'one';
        else if (value === 'Playlist') repeatMode = 'all';
        this.boundController.setRepeatMode(repeatMode);
      }
    }
  }

  public get Rate(): number {
    return this.rate;
  }

  public set Rate(value: number) {
    const clamped = Math.max(this.minimumRate, Math.min(this.maximumRate, value));
    if (this.rate !== clamped) {
      this.rate = clamped;
      this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { Rate: clamped });

      if (this.boundController) {
        this.boundController.setPlaybackRate(clamped);
      }
    }
  }

  public get Shuffle(): boolean {
    return this.shuffle;
  }

  public set Shuffle(value: boolean) {
    if (this.shuffle !== value) {
      this.shuffle = value;
      this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { Shuffle: value });

      if (this.boundController) {
        this.boundController.setShuffle(value);
      }
    }
  }

  public get Metadata(): MPRISMetadata {
    return { ...this.metadata };
  }

  public get Volume(): number {
    return this.volume;
  }

  public set Volume(value: number) {
    const clamped = Math.max(0.0, Math.min(2.0, value));
    if (this.volume !== clamped) {
      this.volume = clamped;
      this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { Volume: clamped });

      if (this.boundController) {
        this.boundController.setVolume(clamped);
      }
    }
  }

  public get Position(): number {
    return this.positionMicroseconds;
  }

  // --- org.mpris.MediaPlayer2 Methods ---

  public Raise(): void {
    if (this.raiseHandler) {
      this.raiseHandler();
    }
  }

  public Quit(): void {
    if (this.quitHandler) {
      this.quitHandler();
    }
  }

  // --- org.mpris.MediaPlayer2.Player Methods ---

  public async Next(): Promise<void> {
    if (this.boundController) {
      await this.boundController.next();
    }
  }

  public async Previous(): Promise<void> {
    if (this.boundController) {
      await this.boundController.previous();
    }
  }

  public Pause(): void {
    if (this.boundController) {
      this.boundController.pause();
    } else {
      this.updatePlaybackStatus('Paused');
    }
  }

  public async PlayPause(): Promise<void> {
    if (this.boundController) {
      await this.boundController.togglePlay();
    } else {
      this.updatePlaybackStatus(this.playbackStatus === 'Playing' ? 'Paused' : 'Playing');
    }
  }

  public Stop(): void {
    if (this.boundController) {
      this.boundController.stop();
    } else {
      this.updatePlaybackStatus('Stopped');
    }
  }

  public async Play(): Promise<void> {
    if (this.boundController) {
      await this.boundController.play();
    } else {
      this.updatePlaybackStatus('Playing');
    }
  }

  public Seek(offsetMicroseconds: number): void {
    const deltaSeconds = microsecondsToSeconds(offsetMicroseconds);
    if (this.boundController) {
      this.boundController.seekRelative(deltaSeconds);
    } else {
      const newPos = Math.max(0, this.positionMicroseconds + offsetMicroseconds);
      this.positionMicroseconds = newPos;
      this.emitSignal({
        path: '/org/mpris/MediaPlayer2',
        interfaceName: MPRIS_PLAYER_INTERFACE,
        member: 'Seeked',
        args: [newPos],
      });
    }
  }

  public SetPosition(trackId: string, positionMicroseconds: number): void {
    // If TrackId is not current track, MPRIS specification mandates ignoring the call
    if (this.metadata['mpris:trackid'] !== trackId) {
      return;
    }

    const posSeconds = microsecondsToSeconds(positionMicroseconds);
    if (this.boundController) {
      this.boundController.seek(posSeconds);
    } else {
      this.positionMicroseconds = Math.max(0, positionMicroseconds);
      this.emitSignal({
        path: '/org/mpris/MediaPlayer2',
        interfaceName: MPRIS_PLAYER_INTERFACE,
        member: 'Seeked',
        args: [this.positionMicroseconds],
      });
    }
  }

  public async OpenUri(uri: string): Promise<void> {
    if (this.boundController) {
      await this.boundController.load(uri, true);
    }
  }

  // --- Signal Management ---

  public onSignal(listener: MPRISSignalListener): UnsubscribeFn {
    this.signalListeners.push(listener);
    return () => {
      this.signalListeners = this.signalListeners.filter((l) => l !== listener);
    };
  }

  public emitSignal(signal: MPRISSignal): void {
    for (const listener of this.signalListeners) {
      try {
        listener(signal);
      } catch (err: unknown) {
        console.error('Error in MPRIS signal listener:', err);
      }
    }
  }

  private emitPropertiesChanged(interfaceName: string, changedProperties: Record<string, unknown>): void {
    this.emitSignal({
      path: '/org/mpris/MediaPlayer2',
      interfaceName: DBUS_PROPERTIES_INTERFACE,
      member: 'PropertiesChanged',
      args: [interfaceName, changedProperties, []],
    });
  }

  // --- State Synchronization ---

  public bindController(controller: IMediaController, events: EventEmitter): UnsubscribeFn {
    this.unbind();
    this.boundController = controller;

    // Initial synchronization
    this.syncFromPlayerState(controller.getState());

    const onStateChange = (state: PlayerState) => {
      this.syncFromPlayerState(state);
    };

    const onStatusChange = (status: PlayerState['status']) => {
      this.updatePlaybackStatus(this.mapStatusToMPRIS(status));
    };

    const onTimeUpdate = (data: { currentTime: number; duration: number; buffered: number }) => {
      const newPos = secondsToMicroseconds(data.currentTime);
      const diff = Math.abs(newPos - this.positionMicroseconds);
      // Discontinuous jump greater than 1.5 seconds indicates a seek
      if (diff > 1_500_000) {
        this.emitSignal({
          path: '/org/mpris/MediaPlayer2',
          interfaceName: MPRIS_PLAYER_INTERFACE,
          member: 'Seeked',
          args: [newPos],
        });
      }
      this.positionMicroseconds = newPos;
    };

    const onVolumeChange = (data: { volume: number; muted: boolean }) => {
      const vol = data.muted ? 0.0 : data.volume;
      if (this.volume !== vol) {
        this.volume = vol;
        this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { Volume: vol });
      }
    };

    const onRateChange = (rate: number) => {
      if (this.rate !== rate) {
        this.rate = rate;
        this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { Rate: rate });
      }
    };

    const onMediaChange = (media: MediaItem | null) => {
      this.updateMetadataFromMedia(media);
    };

    const onRepeatModeChange = (repeatMode: RepeatMode) => {
      let loopStatus: MPRISLoopStatus = 'None';
      if (repeatMode === 'one') loopStatus = 'Track';
      else if (repeatMode === 'all') loopStatus = 'Playlist';

      if (this.loopStatus !== loopStatus) {
        this.loopStatus = loopStatus;
        this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { LoopStatus: loopStatus });
      }
    };

    const onShuffleChange = (shuffle: boolean) => {
      if (this.shuffle !== shuffle) {
        this.shuffle = shuffle;
        this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { Shuffle: shuffle });
      }
    };

    const onQueueChange = (data: { queue: MediaItem[]; index: number }) => {
      const canGoNext = data.queue.length > 0 && data.index < data.queue.length - 1;
      const canGoPrevious = data.queue.length > 0 && data.index > 0;
      const changed: Record<string, unknown> = {};

      if (this.canGoNext !== canGoNext) {
        this.canGoNext = canGoNext;
        changed.CanGoNext = canGoNext;
      }
      if (this.canGoPrevious !== canGoPrevious) {
        this.canGoPrevious = canGoPrevious;
        changed.CanGoPrevious = canGoPrevious;
      }
      if (Object.keys(changed).length > 0) {
        this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, changed);
      }
    };

    this.unbindListeners = [
      events.on('statechange', onStateChange),
      events.on('statuschange', onStatusChange),
      events.on('timeupdate', onTimeUpdate),
      events.on('volumechange', onVolumeChange),
      events.on('ratechange', onRateChange),
      events.on('mediachange', onMediaChange),
      events.on('repeatmodechange', onRepeatModeChange),
      events.on('shufflechange', onShuffleChange),
      events.on('queuechange', onQueueChange),
    ];

    return () => {
      this.unbind();
    };
  }

  public unbind(): void {
    for (const unsubscribe of this.unbindListeners) {
      unsubscribe();
    }
    this.unbindListeners = [];
    this.boundController = null;
  }

  public syncFromPlayerState(state: PlayerState): void {
    this.playbackStatus = this.mapStatusToMPRIS(state.status);
    this.positionMicroseconds = secondsToMicroseconds(state.currentTime);
    this.rate = state.playbackRate;
    this.volume = state.muted ? 0.0 : state.volume;
    this.shuffle = state.shuffle;

    if (state.repeatMode === 'one') this.loopStatus = 'Track';
    else if (state.repeatMode === 'all') this.loopStatus = 'Playlist';
    else this.loopStatus = 'None';

    this.canGoNext = state.queue.length > 0 && state.queueIndex < state.queue.length - 1;
    this.canGoPrevious = state.queue.length > 0 && state.queueIndex > 0;

    this.updateMetadataFromMedia(state.currentMedia);
  }

  private updatePlaybackStatus(status: MPRISPlaybackStatus): void {
    if (this.playbackStatus !== status) {
      this.playbackStatus = status;
      this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { PlaybackStatus: status });
    }
  }

  private updateMetadataFromMedia(media: MediaItem | null): void {
    const newMetadata: MPRISMetadata = {
      'mpris:trackid': media ? encodeTrackId(media.id) : NO_TRACK_ID,
    };

    if (media) {
      if (media.duration > 0) {
        newMetadata['mpris:length'] = secondsToMicroseconds(media.duration);
      }
      const artwork = media.thumbnail || media.metadata?.artwork;
      if (artwork) {
        newMetadata['mpris:artUrl'] = artwork;
      }
      const title = media.title || media.metadata?.title;
      if (title) {
        newMetadata['xesam:title'] = title;
      }
      const artist = media.artist || media.metadata?.artist;
      if (artist) {
        newMetadata['xesam:artist'] = [artist];
      }
      const album = media.album || media.metadata?.album;
      if (album) {
        newMetadata['xesam:album'] = album;
      }
      const url = media.uri || media.path;
      if (url) {
        newMetadata['xesam:url'] = url;
      }
    }

    this.metadata = newMetadata;
    this.emitPropertiesChanged(MPRIS_PLAYER_INTERFACE, { Metadata: newMetadata });
  }

  public mapStatusToMPRIS(status: PlayerState['status']): MPRISPlaybackStatus {
    switch (status) {
      case 'playing':
      case 'buffering':
      case 'loading':
        return 'Playing';
      case 'paused':
        return 'Paused';
      case 'idle':
      case 'ended':
      case 'error':
      default:
        return 'Stopped';
    }
  }

  // --- D-Bus Dispatch, Property Access and Introspection ---

  public getProperty(interfaceName: string, propertyName: string): unknown {
    if (interfaceName === MPRIS_ROOT_INTERFACE) {
      switch (propertyName) {
        case 'CanQuit': return this.canQuit;
        case 'Fullscreen': return this.fullscreen;
        case 'CanSetFullscreen': return this.canSetFullscreen;
        case 'CanRaise': return this.canRaise;
        case 'HasTrackList': return this.hasTrackList;
        case 'Identity': return this.identity;
        case 'DesktopEntry': return this.desktopEntry;
        case 'SupportedUriSchemes': return this.supportedUriSchemes;
        case 'SupportedMimeTypes': return this.supportedMimeTypes;
        default: throw new Error(`Unknown property ${propertyName} on ${interfaceName}`);
      }
    }

    if (interfaceName === MPRIS_PLAYER_INTERFACE) {
      switch (propertyName) {
        case 'PlaybackStatus': return this.PlaybackStatus;
        case 'LoopStatus': return this.LoopStatus;
        case 'Rate': return this.Rate;
        case 'Shuffle': return this.Shuffle;
        case 'Metadata': return this.Metadata;
        case 'Volume': return this.Volume;
        case 'Position': return this.Position;
        case 'MinimumRate': return this.minimumRate;
        case 'MaximumRate': return this.maximumRate;
        case 'CanControl': return this.canControl;
        case 'CanPlay': return this.canPlay;
        case 'CanPause': return this.canPause;
        case 'CanSeek': return this.canSeek;
        case 'CanGoNext': return this.canGoNext;
        case 'CanGoPrevious': return this.canGoPrevious;
        default: throw new Error(`Unknown property ${propertyName} on ${interfaceName}`);
      }
    }

    throw new Error(`Unknown interface ${interfaceName}`);
  }

  public setProperty(interfaceName: string, propertyName: string, value: unknown): void {
    if (interfaceName === MPRIS_ROOT_INTERFACE) {
      if (propertyName === 'Fullscreen' && typeof value === 'boolean') {
        this.fullscreen = value;
        this.emitPropertiesChanged(MPRIS_ROOT_INTERFACE, { Fullscreen: value });
        return;
      }
      throw new Error(`Property ${propertyName} on ${interfaceName} is read-only or invalid`);
    }

    if (interfaceName === MPRIS_PLAYER_INTERFACE) {
      switch (propertyName) {
        case 'LoopStatus':
          if (typeof value === 'string' && (value === 'None' || value === 'Track' || value === 'Playlist')) {
            this.LoopStatus = value;
            return;
          }
          break;
        case 'Rate':
          if (typeof value === 'number') {
            this.Rate = value;
            return;
          }
          break;
        case 'Shuffle':
          if (typeof value === 'boolean') {
            this.Shuffle = value;
            return;
          }
          break;
        case 'Volume':
          if (typeof value === 'number') {
            this.Volume = value;
            return;
          }
          break;
      }
      throw new Error(`Property ${propertyName} on ${interfaceName} cannot be set with value ${String(value)}`);
    }

    throw new Error(`Unknown interface ${interfaceName}`);
  }

  public getAllProperties(interfaceName: string): Record<string, unknown> {
    if (interfaceName === MPRIS_ROOT_INTERFACE) {
      return {
        CanQuit: this.canQuit,
        Fullscreen: this.fullscreen,
        CanSetFullscreen: this.canSetFullscreen,
        CanRaise: this.canRaise,
        HasTrackList: this.hasTrackList,
        Identity: this.identity,
        DesktopEntry: this.desktopEntry,
        SupportedUriSchemes: this.supportedUriSchemes,
        SupportedMimeTypes: this.supportedMimeTypes,
      };
    }

    if (interfaceName === MPRIS_PLAYER_INTERFACE) {
      return {
        PlaybackStatus: this.PlaybackStatus,
        LoopStatus: this.LoopStatus,
        Rate: this.Rate,
        Shuffle: this.Shuffle,
        Metadata: this.Metadata,
        Volume: this.Volume,
        Position: this.Position,
        MinimumRate: this.minimumRate,
        MaximumRate: this.maximumRate,
        CanControl: this.canControl,
        CanPlay: this.canPlay,
        CanPause: this.canPause,
        CanSeek: this.canSeek,
        CanGoNext: this.canGoNext,
        CanGoPrevious: this.canGoPrevious,
      };
    }

    return {};
  }

  public async handleMethodCall(
    interfaceName: string,
    member: string,
    args: unknown[] = []
  ): Promise<unknown> {
    // Properties interface
    if (interfaceName === DBUS_PROPERTIES_INTERFACE) {
      if (member === 'Get') {
        const [iface, prop] = args as [string, string];
        return this.getProperty(iface, prop);
      }
      if (member === 'Set') {
        const [iface, prop, val] = args as [string, string, unknown];
        this.setProperty(iface, prop, val);
        return;
      }
      if (member === 'GetAll') {
        const [iface] = args as [string];
        return this.getAllProperties(iface);
      }
    }

    // Introspectable interface
    if (interfaceName === DBUS_INTROSPECTABLE_INTERFACE && member === 'Introspect') {
      return this.getIntrospectionXml();
    }

    // Root interface
    if (interfaceName === MPRIS_ROOT_INTERFACE) {
      if (member === 'Raise') {
        this.Raise();
        return;
      }
      if (member === 'Quit') {
        this.Quit();
        return;
      }
    }

    // Player interface
    if (interfaceName === MPRIS_PLAYER_INTERFACE) {
      switch (member) {
        case 'Next':
          await this.Next();
          return;
        case 'Previous':
          await this.Previous();
          return;
        case 'Pause':
          this.Pause();
          return;
        case 'PlayPause':
          await this.PlayPause();
          return;
        case 'Stop':
          this.Stop();
          return;
        case 'Play':
          await this.Play();
          return;
        case 'Seek': {
          const [offset] = args as [number];
          this.Seek(offset);
          return;
        }
        case 'SetPosition': {
          const [trackId, position] = args as [string, number];
          this.SetPosition(trackId, position);
          return;
        }
        case 'OpenUri': {
          const [uri] = args as [string];
          await this.OpenUri(uri);
          return;
        }
      }
    }

    throw new Error(`Method ${member} not found on interface ${interfaceName}`);
  }

  /**
   * Handle incoming serialized D-Bus message for IPC or network bridges.
   */
  public async handleDBusMessage(message: DBusMessage): Promise<DBusMessage> {
    if (message.type !== 'method_call') {
      return {
        type: 'error',
        errorName: 'org.freedesktop.DBus.Error.InvalidArgs',
        errorMessage: 'Only method_call messages can be handled',
      };
    }

    try {
      const iface = message.interface ?? MPRIS_PLAYER_INTERFACE;
      const member = message.member ?? '';
      const args = message.body ?? [];

      const result = await this.handleMethodCall(iface, member, args);

      return {
        type: 'method_return',
        body: result !== undefined ? [result] : [],
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        type: 'error',
        errorName: 'org.freedesktop.DBus.Error.Failed',
        errorMessage: errorMsg,
      };
    }
  }

  /**
   * Generates standard D-Bus introspection XML.
   */
  public getIntrospectionXml(): string {
    return `<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
"http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node name="/org/mpris/MediaPlayer2">
  <interface name="org.freedesktop.DBus.Introspectable">
    <method name="Introspect">
      <arg name="data" direction="out" type="s"/>
    </method>
  </interface>
  <interface name="org.freedesktop.DBus.Properties">
    <method name="Get">
      <arg name="interface_name" direction="in" type="s"/>
      <arg name="property_name" direction="in" type="s"/>
      <arg name="value" direction="out" type="v"/>
    </method>
    <method name="Set">
      <arg name="interface_name" direction="in" type="s"/>
      <arg name="property_name" direction="in" type="s"/>
      <arg name="value" direction="in" type="v"/>
    </method>
    <method name="GetAll">
      <arg name="interface_name" direction="in" type="s"/>
      <arg name="properties" direction="out" type="a{sv}"/>
    </method>
    <signal name="PropertiesChanged">
      <arg name="interface_name" type="s"/>
      <arg name="changed_properties" type="a{sv}"/>
      <arg name="invalidated_properties" type="as"/>
    </signal>
  </interface>
  <interface name="org.mpris.MediaPlayer2">
    <property name="CanQuit" type="b" access="read"/>
    <property name="Fullscreen" type="b" access="readwrite"/>
    <property name="CanSetFullscreen" type="b" access="read"/>
    <property name="CanRaise" type="b" access="read"/>
    <property name="HasTrackList" type="b" access="read"/>
    <property name="Identity" type="s" access="read"/>
    <property name="DesktopEntry" type="s" access="read"/>
    <property name="SupportedUriSchemes" type="as" access="read"/>
    <property name="SupportedMimeTypes" type="as" access="read"/>
    <method name="Raise"/>
    <method name="Quit"/>
  </interface>
  <interface name="org.mpris.MediaPlayer2.Player">
    <property name="PlaybackStatus" type="s" access="read"/>
    <property name="LoopStatus" type="s" access="readwrite"/>
    <property name="Rate" type="d" access="readwrite"/>
    <property name="Shuffle" type="b" access="readwrite"/>
    <property name="Metadata" type="a{sv}" access="read"/>
    <property name="Volume" type="d" access="readwrite"/>
    <property name="Position" type="x" access="read"/>
    <property name="MinimumRate" type="d" access="read"/>
    <property name="MaximumRate" type="d" access="read"/>
    <property name="CanControl" type="b" access="read"/>
    <property name="CanPlay" type="b" access="read"/>
    <property name="CanPause" type="b" access="read"/>
    <property name="CanSeek" type="b" access="read"/>
    <property name="CanGoNext" type="b" access="read"/>
    <property name="CanGoPrevious" type="b" access="read"/>
    <method name="Next"/>
    <method name="Previous"/>
    <method name="Pause"/>
    <method name="PlayPause"/>
    <method name="Stop"/>
    <method name="Play"/>
    <method name="Seek">
      <arg name="Offset" direction="in" type="x"/>
    </method>
    <method name="SetPosition">
      <arg name="TrackId" direction="in" type="o"/>
      <arg name="Position" direction="in" type="x"/>
    </method>
    <method name="OpenUri">
      <arg name="Uri" direction="in" type="s"/>
    </method>
    <signal name="Seeked">
      <arg name="Position" type="x"/>
    </signal>
  </interface>
</node>`;
  }
}
