import { describe, expect, it, mock } from 'bun:test';
import {
  ALL_FILE_TYPES,
  AUDIO_FILE_TYPES,
  SUBTITLE_FILE_TYPES,
  VIDEO_FILE_TYPES,
  extractExtension,
  generateDesktopEntry,
  generateMacOSInfoExtension,
  generateWindowsManifest,
  getAllExtensions,
  getAllMimeTypes,
  getExtension,
  getFileCategory,
  getMimeType,
  getSupportedAudioFormats,
  getSupportedSubtitleFormats,
  getSupportedVideoFormats,
  isSupportedMedia,
  isSupportedSubtitle,
} from '../src/os/associations';
import {
  DBUS_INTROSPECTABLE_INTERFACE,
  DBUS_PROPERTIES_INTERFACE,
  MPRIS_PLAYER_INTERFACE,
  MPRIS_ROOT_INTERFACE,
  MPRISService,
  NO_TRACK_ID,
  encodeTrackId,
  microsecondsToSeconds,
  secondsToMicroseconds,
} from '../src/os/mpris';
import {
  type INavigatorMediaSession,
  type MediaMetadataInit,
  type MediaPositionState,
  type MediaSessionAction,
  type MediaSessionActionHandler,
  type MediaSessionPlaybackState,
  MediaSessionAdapter,
} from '../src/os/mediasession';
import { EventEmitter } from '../src/core/events';
import type { IMediaController, MediaItem, PlayerState, RepeatMode } from '../src/core/types';

function createMockController(initialStateOverrides: Partial<PlayerState> = {}): IMediaController {
  const defaultState: PlayerState = {
    status: 'idle',
    currentTime: 0,
    duration: 120,
    buffered: 60,
    volume: 1.0,
    muted: false,
    playbackRate: 1.0,
    aspectRatio: 'contain',
    currentMedia: {
      id: 'test-media-1',
      uri: 'file:///media/test.mp4',
      title: 'Test Title',
      artist: 'Test Artist',
      album: 'Test Album',
      duration: 120,
      thumbnail: 'file:///media/test.jpg',
      addedAt: Date.now(),
    },
    audioTracks: [],
    selectedAudioTrackId: null,
    subtitleTracks: [],
    selectedSubtitleTrackId: null,
    subtitleOffset: 0,
    activeCues: [],
    repeatMode: 'off',
    shuffle: false,
    queue: [
      {
        id: 'test-media-1',
        uri: 'file:///media/test.mp4',
        title: 'Test Title',
        duration: 120,
        addedAt: Date.now(),
      },
      {
        id: 'test-media-2',
        uri: 'file:///media/test2.mp4',
        title: 'Test Title 2',
        duration: 180,
        addedAt: Date.now(),
      },
    ],
    queueIndex: 0,
    ...initialStateOverrides,
  };

  let state = { ...defaultState };

  return {
    getState: () => ({ ...state }),
    load: mock(async (media: MediaItem | string) => {
      if (typeof media === 'string') {
        state.currentMedia = {
          id: 'loaded-1',
          uri: media,
          title: 'Loaded Media',
          duration: 100,
          addedAt: Date.now(),
        };
      } else {
        state.currentMedia = media;
      }
      state.status = 'playing';
    }),
    play: mock(async () => {
      state.status = 'playing';
    }),
    pause: mock(() => {
      state.status = 'paused';
    }),
    togglePlay: mock(async () => {
      state.status = state.status === 'playing' ? 'paused' : 'playing';
    }),
    seek: mock((position: number) => {
      state.currentTime = position;
    }),
    seekRelative: mock((delta: number) => {
      state.currentTime = Math.max(0, Math.min(state.duration, state.currentTime + delta));
    }),
    stop: mock(() => {
      state.status = 'idle';
      state.currentTime = 0;
    }),
    release: mock(() => {}),
    setVolume: mock((vol: number) => {
      state.volume = vol;
    }),
    toggleMute: mock(() => {
      state.muted = !state.muted;
    }),
    setPlaybackRate: mock((rate: number) => {
      state.playbackRate = rate;
    }),
    setAspectRatio: mock((ratio) => {
      state.aspectRatio = ratio;
    }),
    stepFrame: mock(() => {}),
    setAudioTrack: mock((id) => {
      state.selectedAudioTrackId = id;
    }),
    setSubtitleTrack: mock((id) => {
      state.selectedSubtitleTrackId = id;
    }),
    setSubtitleOffset: mock((offset) => {
      state.subtitleOffset = offset;
    }),
    setQueue: mock((items: MediaItem[], startIndex = 0) => {
      state.queue = items;
      state.queueIndex = startIndex;
    }),
    addToQueue: mock((item: MediaItem) => {
      state.queue.push(item);
    }),
    removeFromQueue: mock((index: number) => {
      state.queue.splice(index, 1);
    }),
    next: mock(async () => {
      if (state.queueIndex < state.queue.length - 1) {
        state.queueIndex++;
        state.currentMedia = state.queue[state.queueIndex] ?? null;
      }
    }),
    previous: mock(async () => {
      if (state.queueIndex > 0) {
        state.queueIndex--;
        state.currentMedia = state.queue[state.queueIndex] ?? null;
      }
    }),
    setRepeatMode: mock((mode: RepeatMode) => {
      state.repeatMode = mode;
    }),
    setShuffle: mock((enabled: boolean) => {
      state.shuffle = enabled;
    }),
  };
}

describe('File Associations and Manifests (src/os/associations.ts)', () => {
  it('should define all required video formats', () => {
    const requiredVideos = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv'];
    for (const ext of requiredVideos) {
      expect(isSupportedMedia(ext)).toBe(true);
      expect(getFileCategory(ext)).toBe('video');
      expect(getMimeType(ext)).toBeDefined();
    }

    expect(getMimeType('.mp4')).toBe('video/mp4');
    expect(getMimeType('.mkv')).toBe('video/x-matroska');
    expect(getMimeType('.webm')).toBe('video/webm');
    expect(getMimeType('.avi')).toBe('video/x-msvideo');
    expect(getMimeType('.mov')).toBe('video/quicktime');
    expect(getMimeType('.flv')).toBe('video/x-flv');
  });

  it('should define all required audio formats', () => {
    const requiredAudios = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.opus'];
    for (const ext of requiredAudios) {
      expect(isSupportedMedia(ext)).toBe(true);
      expect(getFileCategory(ext)).toBe('audio');
      expect(getMimeType(ext)).toBeDefined();
    }

    expect(getMimeType('.mp3')).toBe('audio/mpeg');
    expect(getMimeType('.flac')).toBe('audio/flac');
    expect(getMimeType('.wav')).toBe('audio/wav');
    expect(getMimeType('.aac')).toBe('audio/aac');
    expect(getMimeType('.ogg')).toBe('audio/ogg');
    expect(getMimeType('.m4a')).toBe('audio/mp4');
    expect(getMimeType('.opus')).toBe('audio/opus');
  });

  it('should define all required subtitle formats', () => {
    const requiredSubtitles = ['.srt', '.vtt', '.ass'];
    for (const ext of requiredSubtitles) {
      expect(isSupportedSubtitle(ext)).toBe(true);
      expect(getFileCategory(ext)).toBe('subtitle');
      expect(getMimeType(ext)).toBeDefined();
    }

    expect(getMimeType('.srt')).toBe('application/x-subrip');
    expect(getMimeType('.vtt')).toBe('text/vtt');
    expect(getMimeType('.ass')).toBe('text/x-ssa');
  });

  it('should handle format getters and lists', () => {
    expect(getSupportedVideoFormats().length).toBeGreaterThanOrEqual(6);
    expect(getSupportedAudioFormats().length).toBeGreaterThanOrEqual(7);
    expect(getSupportedSubtitleFormats().length).toBeGreaterThanOrEqual(3);
    expect(ALL_FILE_TYPES.length).toBeGreaterThanOrEqual(16);

    const mimes = getAllMimeTypes();
    expect(mimes).toContain('video/mp4');
    expect(mimes).toContain('audio/mpeg');
    expect(mimes).toContain('application/x-subrip');

    const exts = getAllExtensions();
    expect(exts).toContain('.mp4');
    expect(exts).toContain('.mp3');
    expect(exts).toContain('.srt');
  });

  it('should look up extension by MIME type', () => {
    expect(getExtension('video/mp4')).toBe('.mp4');
    expect(getExtension('audio/mpeg')).toBe('.mp3');
    expect(getExtension('text/vtt')).toBe('.vtt');
    expect(getExtension('unknown/mime')).toBeUndefined();
  });

  it('should extract extensions from filenames, URLs and paths', () => {
    expect(extractExtension('/home/user/movie.mp4')).toBe('.mp4');
    expect(extractExtension('https://example.com/audio.MP3?query=1#hash')).toBe('.mp3');
    expect(extractExtension('subtitles.VTT')).toBe('.vtt');
    expect(extractExtension('no_extension_file')).toBe('');
    expect(extractExtension('.gitignore')).toBe('');
  });

  it('should correctly categorize files and unknown files', () => {
    expect(getFileCategory('/path/to/video.mkv')).toBe('video');
    expect(getFileCategory('song.flac')).toBe('audio');
    expect(getFileCategory('track.ass')).toBe('subtitle');
    expect(getFileCategory('document.pdf')).toBe('unknown');
    expect(isSupportedMedia('unknown.xyz')).toBe(false);
    expect(isSupportedSubtitle('unknown.xyz')).toBe(false);
  });

  it('should generate compliant Linux XDG desktop entry', () => {
    const desktop = generateDesktopEntry('cimo-bin', 'cimo-icon');
    expect(desktop).toContain('[Desktop Entry]');
    expect(desktop).toContain('Type=Application');
    expect(desktop).toContain('Name=Cimo');
    expect(desktop).toContain('Exec=cimo-bin %U');
    expect(desktop).toContain('Icon=cimo-icon');
    expect(desktop).toContain('Categories=AudioVideo;Player;Video;Audio;');
    expect(desktop).toContain('MimeType=');
    expect(desktop).toContain('video/mp4;');
    expect(desktop).toContain('audio/mpeg;');
    expect(desktop).toContain('application/x-subrip;');
    expect(desktop).toContain('Actions=PlayPause;Next;Previous;Stop;');
    expect(desktop).toContain('[Desktop Action PlayPause]');
    expect(desktop).toContain('[Desktop Action Next]');
    expect(desktop).toContain('[Desktop Action Previous]');
    expect(desktop).toContain('[Desktop Action Stop]');
  });

  it('should generate Windows manifest XML', () => {
    const winManifest = generateWindowsManifest('CimoPlayer', 'cimo.exe');
    expect(winManifest).toContain('<?xml version="1.0" encoding="utf-8"?>');
    expect(winManifest).toContain('xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"');
    expect(winManifest).toContain('<uap:Extension Category="windows.fileTypeAssociation">');
    expect(winManifest).toContain('<uap:FileTypeAssociation Name="cimoplayer.media">');
    expect(winManifest).toContain('<uap:FileType>.mp4</uap:FileType>');
    expect(winManifest).toContain('<uap:FileType>.mp3</uap:FileType>');
    expect(winManifest).toContain('<uap:FileType>.srt</uap:FileType>');
  });

  it('should generate macOS Info.plist document types fragment', () => {
    const macPlist = generateMacOSInfoExtension();
    expect(macPlist).toContain('<key>CFBundleDocumentTypes</key>');
    expect(macPlist).toContain('<array>');
    expect(macPlist).toContain('<key>CFBundleTypeName</key>');
    expect(macPlist).toContain('<string>Video File</string>');
    expect(macPlist).toContain('<string>Audio File</string>');
    expect(macPlist).toContain('<string>Subtitle File</string>');
    expect(macPlist).toContain('<key>CFBundleTypeRole</key>');
    expect(macPlist).toContain('<string>Viewer</string>');
    expect(macPlist).toContain('<string>mp4</string>');
    expect(macPlist).toContain('<string>video/mp4</string>');
  });
});

describe('MPRIS Service (src/os/mpris.ts)', () => {
  it('should initialize with standard MPRIS properties', () => {
    const mpris = new MPRISService();

    expect(mpris.identity).toBe('Cimo');
    expect(mpris.desktopEntry).toBe('cimo');
    expect(mpris.canQuit).toBe(true);
    expect(mpris.canRaise).toBe(true);
    expect(mpris.hasTrackList).toBe(false);
    expect(mpris.supportedUriSchemes).toEqual(['file', 'http', 'https']);
    expect(mpris.supportedMimeTypes.length).toBeGreaterThan(0);

    expect(mpris.PlaybackStatus).toBe('Stopped');
    expect(mpris.LoopStatus).toBe('None');
    expect(mpris.Rate).toBe(1.0);
    expect(mpris.Shuffle).toBe(false);
    expect(mpris.Volume).toBe(1.0);
    expect(mpris.Position).toBe(0);
    expect(mpris.Metadata['mpris:trackid']).toBe(NO_TRACK_ID);
    expect(mpris.canControl).toBe(true);
    expect(mpris.canPlay).toBe(true);
    expect(mpris.canPause).toBe(true);
    expect(mpris.canSeek).toBe(true);
  });

  it('should correctly encode track IDs and convert microseconds', () => {
    expect(encodeTrackId(null)).toBe(NO_TRACK_ID);
    expect(encodeTrackId('')).toBe(NO_TRACK_ID);
    expect(encodeTrackId('song-123')).toBe('/org/cimo/Track/song_2d_123');
    expect(encodeTrackId('simple_id')).toBe('/org/cimo/Track/simple_id');

    expect(secondsToMicroseconds(1.5)).toBe(1500000);
    expect(secondsToMicroseconds(0)).toBe(0);
    expect(secondsToMicroseconds(-5)).toBe(0);
    expect(microsecondsToSeconds(2500000)).toBe(2.5);
  });

  it('should update properties via setters and clamp rates/volumes', () => {
    const mpris = new MPRISService();
    const signals: unknown[] = [];
    mpris.onSignal((sig) => signals.push(sig));

    mpris.LoopStatus = 'Track';
    expect(mpris.LoopStatus).toBe('Track');

    mpris.Shuffle = true;
    expect(mpris.Shuffle).toBe(true);

    mpris.Rate = 2.5;
    expect(mpris.Rate).toBe(2.5);

    // Rate clamping to [0.25, 4.0]
    mpris.Rate = 10.0;
    expect(mpris.Rate).toBe(4.0);
    mpris.Rate = 0.05;
    expect(mpris.Rate).toBe(0.25);

    // Volume clamping to [0.0, 2.0] (200% volume boost)
    mpris.Volume = 1.8;
    expect(mpris.Volume).toBe(1.8);
    mpris.Volume = 3.5;
    expect(mpris.Volume).toBe(2.0);
    mpris.Volume = -1.0;
    expect(mpris.Volume).toBe(0.0);

    expect(signals.length).toBeGreaterThan(0);
  });

  it('should handle standalone methods and signals', async () => {
    const mpris = new MPRISService();
    const signals: unknown[] = [];
    mpris.onSignal((sig) => signals.push(sig));

    await mpris.Play();
    expect(mpris.PlaybackStatus).toBe('Playing');

    mpris.Pause();
    expect(mpris.PlaybackStatus).toBe('Paused');

    await mpris.PlayPause();
    expect(mpris.PlaybackStatus).toBe('Playing');

    mpris.Stop();
    expect(mpris.PlaybackStatus).toBe('Stopped');

    mpris.Seek(5000000); // +5s
    expect(mpris.Position).toBe(5000000);

    mpris.SetPosition(NO_TRACK_ID, 2000000); // 2s
    expect(mpris.Position).toBe(2000000);

    // Should ignore SetPosition for wrong trackid
    mpris.SetPosition('/invalid/track/id', 10000000);
    expect(mpris.Position).toBe(2000000);
  });

  it('should handle Raise and Quit handlers', () => {
    const onQuit = mock(() => {});
    const onRaise = mock(() => {});
    const mpris = new MPRISService({ quitHandler: onQuit, raiseHandler: onRaise });

    mpris.Raise();
    expect(onRaise).toHaveBeenCalledTimes(1);

    mpris.Quit();
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it('should generate valid D-Bus Introspection XML', () => {
    const mpris = new MPRISService();
    const xml = mpris.getIntrospectionXml();

    expect(xml).toContain('<node name="/org/mpris/MediaPlayer2">');
    expect(xml).toContain('<interface name="org.freedesktop.DBus.Introspectable">');
    expect(xml).toContain('<interface name="org.freedesktop.DBus.Properties">');
    expect(xml).toContain('<interface name="org.mpris.MediaPlayer2">');
    expect(xml).toContain('<interface name="org.mpris.MediaPlayer2.Player">');
    expect(xml).toContain('<property name="PlaybackStatus" type="s" access="read"/>');
    expect(xml).toContain('<property name="Volume" type="d" access="readwrite"/>');
    expect(xml).toContain('<method name="PlayPause"/>');
    expect(xml).toContain('<signal name="Seeked">');
  });

  it('should handle D-Bus method calls and property queries', async () => {
    const mpris = new MPRISService();

    // Get properties
    expect(mpris.getProperty(MPRIS_ROOT_INTERFACE, 'Identity')).toBe('Cimo');
    expect(mpris.getProperty(MPRIS_PLAYER_INTERFACE, 'PlaybackStatus')).toBe('Stopped');
    expect(mpris.getProperty(MPRIS_PLAYER_INTERFACE, 'Rate')).toBe(1.0);

    // GetAll properties
    const allRoot = mpris.getAllProperties(MPRIS_ROOT_INTERFACE);
    expect(allRoot.Identity).toBe('Cimo');
    expect(allRoot.CanQuit).toBe(true);

    const allPlayer = mpris.getAllProperties(MPRIS_PLAYER_INTERFACE);
    expect(allPlayer.PlaybackStatus).toBe('Stopped');
    expect(allPlayer.CanControl).toBe(true);

    // Set properties
    mpris.setProperty(MPRIS_PLAYER_INTERFACE, 'Volume', 1.5);
    expect(mpris.Volume).toBe(1.5);

    mpris.setProperty(MPRIS_PLAYER_INTERFACE, 'LoopStatus', 'Playlist');
    expect(mpris.LoopStatus).toBe('Playlist');

    // D-Bus method call dispatch
    await mpris.handleMethodCall(MPRIS_PLAYER_INTERFACE, 'Play');
    expect(mpris.PlaybackStatus).toBe('Playing');

    const introspectionResult = await mpris.handleMethodCall(
      DBUS_INTROSPECTABLE_INTERFACE,
      'Introspect'
    );
    expect(typeof introspectionResult).toBe('string');
    expect(introspectionResult).toContain('org.mpris.MediaPlayer2');

    const getResult = await mpris.handleMethodCall(DBUS_PROPERTIES_INTERFACE, 'Get', [
      MPRIS_PLAYER_INTERFACE,
      'PlaybackStatus',
    ]);
    expect(getResult).toBe('Playing');

    // handleDBusMessage
    const res = await mpris.handleDBusMessage({
      type: 'method_call',
      interface: MPRIS_PLAYER_INTERFACE,
      member: 'Pause',
      body: [],
    });
    expect(res.type).toBe('method_return');
    expect(mpris.PlaybackStatus).toBe('Paused');
  });

  it('should bind to IMediaController and EventEmitter and sync all state', async () => {
    const controller = createMockController();
    const events = new EventEmitter();
    const mpris = new MPRISService();

    const unbind = mpris.bindController(controller, events);

    // Initial state check
    expect(mpris.Metadata['xesam:title']).toBe('Test Title');
    expect(mpris.Metadata['xesam:artist']).toEqual(['Test Artist']);
    expect(mpris.Metadata['xesam:album']).toBe('Test Album');
    expect(mpris.Metadata['mpris:length']).toBe(120000000);
    expect(mpris.canGoNext).toBe(true);
    expect(mpris.canGoPrevious).toBe(false);

    // Status change
    events.emit('statuschange', 'playing');
    expect(mpris.PlaybackStatus).toBe('Playing');

    events.emit('statuschange', 'paused');
    expect(mpris.PlaybackStatus).toBe('Paused');

    // Time update & Seek signal
    const signals: unknown[] = [];
    mpris.onSignal((s) => signals.push(s));
    events.emit('timeupdate', { currentTime: 30, duration: 120, buffered: 60 });
    expect(mpris.Position).toBe(30000000);

    // Volume change
    events.emit('volumechange', { volume: 1.8, muted: false });
    expect(mpris.Volume).toBe(1.8);

    events.emit('volumechange', { volume: 1.8, muted: true });
    expect(mpris.Volume).toBe(0.0);

    // Rate change
    events.emit('ratechange', 1.25);
    expect(mpris.Rate).toBe(1.25);

    // Repeat mode change
    events.emit('repeatmodechange', 'one');
    expect(mpris.LoopStatus).toBe('Track');

    events.emit('repeatmodechange', 'all');
    expect(mpris.LoopStatus).toBe('Playlist');

    events.emit('repeatmodechange', 'off');
    expect(mpris.LoopStatus).toBe('None');

    // Shuffle change
    events.emit('shufflechange', true);
    expect(mpris.Shuffle).toBe(true);

    // Queue change
    events.emit('queuechange', {
      queue: controller.getState().queue,
      index: 1,
    });
    expect(mpris.canGoNext).toBe(false);
    expect(mpris.canGoPrevious).toBe(true);

    // Method calls forwarding to controller
    await mpris.Play();
    expect(controller.play).toHaveBeenCalled();

    mpris.Pause();
    expect(controller.pause).toHaveBeenCalled();

    await mpris.PlayPause();
    expect(controller.togglePlay).toHaveBeenCalled();

    mpris.Stop();
    expect(controller.stop).toHaveBeenCalled();

    await mpris.Next();
    expect(controller.next).toHaveBeenCalled();

    await mpris.Previous();
    expect(controller.previous).toHaveBeenCalled();

    mpris.Seek(10000000); // 10s
    expect(controller.seekRelative).toHaveBeenCalledWith(10);

    mpris.SetPosition(mpris.Metadata['mpris:trackid'], 45000000); // 45s
    expect(controller.seek).toHaveBeenCalledWith(45);

    await mpris.OpenUri('file:///home/user/song.mp3');
    expect(controller.load).toHaveBeenCalledWith('file:///home/user/song.mp3', true);

    // Cleanup
    unbind();
  });
});

describe('MediaSession Adapter (src/os/mediasession.ts)', () => {
  function createMockMediaSession(): INavigatorMediaSession & {
    actionHandlers: Map<MediaSessionAction, MediaSessionActionHandler | null>;
    positionStateHistory: MediaPositionState[];
  } {
    const actionHandlers = new Map<MediaSessionAction, MediaSessionActionHandler | null>();
    const positionStateHistory: MediaPositionState[] = [];

    return {
      metadata: null,
      playbackState: 'none',
      actionHandlers,
      positionStateHistory,
      setActionHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
        actionHandlers.set(action, handler);
      },
      setPositionState(state?: MediaPositionState) {
        if (state) {
          positionStateHistory.push(state);
        }
      },
    };
  }

  it('should initialize with custom session and report support', () => {
    const mockSession = createMockMediaSession();
    const adapter = new MediaSessionAdapter(mockSession);

    expect(adapter.isSupported()).toBe(true);
    expect(adapter.getSession()).toBe(mockSession);
  });

  it('should accurately map playback statuses', () => {
    const adapter = new MediaSessionAdapter();
    expect(adapter.mapStatusToPlaybackState('playing')).toBe('playing');
    expect(adapter.mapStatusToPlaybackState('buffering')).toBe('playing');
    expect(adapter.mapStatusToPlaybackState('loading')).toBe('playing');
    expect(adapter.mapStatusToPlaybackState('paused')).toBe('paused');
    expect(adapter.mapStatusToPlaybackState('idle')).toBe('none');
    expect(adapter.mapStatusToPlaybackState('ended')).toBe('none');
    expect(adapter.mapStatusToPlaybackState('error')).toBe('none');
  });

  it('should update metadata from media item', () => {
    const mockSession = createMockMediaSession();
    const adapter = new MediaSessionAdapter(mockSession);

    const media: MediaItem = {
      id: 'item-1',
      uri: 'https://example.com/audio.mp3',
      title: 'Ocean Waves',
      artist: 'Nature Sounds',
      album: 'Relaxation Vol. 1',
      duration: 300,
      thumbnail: 'https://example.com/cover.jpg',
      addedAt: Date.now(),
    };

    adapter.updateMetadata(media);

    expect(mockSession.metadata).not.toBeNull();
    expect(mockSession.metadata?.title).toBe('Ocean Waves');
    expect(mockSession.metadata?.artist).toBe('Nature Sounds');
    expect(mockSession.metadata?.album).toBe('Relaxation Vol. 1');
    expect(mockSession.metadata?.artwork?.length).toBe(1);
    expect(mockSession.metadata?.artwork?.[0]?.src).toBe('https://example.com/cover.jpg');

    adapter.updateMetadata(null);
    expect(mockSession.metadata).toBeNull();
  });

  it('should update position state within bounds', () => {
    const mockSession = createMockMediaSession();
    const adapter = new MediaSessionAdapter(mockSession);

    adapter.setPositionState({
      duration: 100,
      position: 50,
      playbackRate: 1.5,
    });

    expect(mockSession.positionStateHistory.length).toBe(1);
    expect(mockSession.positionStateHistory[0]).toEqual({
      duration: 100,
      position: 50,
      playbackRate: 1.5,
    });

    // Clamps out of bounds position
    adapter.setPositionState({
      duration: 100,
      position: 150,
      playbackRate: 1.0,
    });

    expect(mockSession.positionStateHistory[1]?.position).toBe(100);

    // Ignores invalid duration
    adapter.setPositionState({
      duration: -10,
      position: 0,
    });
    expect(mockSession.positionStateHistory.length).toBe(2);
  });

  it('should bind to controller, register actions, and route action calls', async () => {
    const mockSession = createMockMediaSession();
    const adapter = new MediaSessionAdapter(mockSession);
    const controller = createMockController();
    const events = new EventEmitter();

    const unbind = adapter.bind(controller, events);

    // Check action handlers registered
    expect(mockSession.actionHandlers.has('play')).toBe(true);
    expect(mockSession.actionHandlers.has('pause')).toBe(true);
    expect(mockSession.actionHandlers.has('seekbackward')).toBe(true);
    expect(mockSession.actionHandlers.has('seekforward')).toBe(true);
    expect(mockSession.actionHandlers.has('previoustrack')).toBe(true);
    expect(mockSession.actionHandlers.has('nexttrack')).toBe(true);
    expect(mockSession.actionHandlers.has('stop')).toBe(true);
    expect(mockSession.actionHandlers.has('seekto')).toBe(true);

    // Trigger action handlers
    mockSession.actionHandlers.get('play')?.({ action: 'play' });
    expect(controller.play).toHaveBeenCalled();

    mockSession.actionHandlers.get('pause')?.({ action: 'pause' });
    expect(controller.pause).toHaveBeenCalled();

    mockSession.actionHandlers.get('seekbackward')?.({ action: 'seekbackward', seekOffset: 15 });
    expect(controller.seekRelative).toHaveBeenCalledWith(-15);

    mockSession.actionHandlers.get('seekforward')?.({ action: 'seekforward', seekOffset: 15 });
    expect(controller.seekRelative).toHaveBeenCalledWith(15);

    mockSession.actionHandlers.get('previoustrack')?.({ action: 'previoustrack' });
    expect(controller.previous).toHaveBeenCalled();

    mockSession.actionHandlers.get('nexttrack')?.({ action: 'nexttrack' });
    expect(controller.next).toHaveBeenCalled();

    mockSession.actionHandlers.get('stop')?.({ action: 'stop' });
    expect(controller.stop).toHaveBeenCalled();

    mockSession.actionHandlers.get('seekto')?.({ action: 'seekto', seekTime: 42 });
    expect(controller.seek).toHaveBeenCalledWith(42);

    // Event updates
    events.emit('statuschange', 'playing');
    expect(mockSession.playbackState).toBe('playing');

    events.emit('statuschange', 'paused');
    expect(mockSession.playbackState).toBe('paused');

    events.emit('timeupdate', { currentTime: 25, duration: 120, buffered: 60 });
    expect(mockSession.positionStateHistory.length).toBeGreaterThan(0);
    const lastPos = mockSession.positionStateHistory[mockSession.positionStateHistory.length - 1];
    expect(lastPos?.position).toBe(25);
    expect(lastPos?.duration).toBe(120);

    // Unbind
    unbind();
    expect(mockSession.actionHandlers.get('play')).toBeNull();
    expect(mockSession.actionHandlers.get('pause')).toBeNull();
  });
});
