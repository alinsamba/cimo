import { MediaController } from '../core/controller';
import { ShortcutEngine } from '../core/shortcuts';
import { VideoEngine } from '../engine/video';
import { FloatingHUD } from './hud';
import { GestureEngine } from './gestures';
import { LibraryDrawer } from './drawer';
import { SubtitleRenderer } from '../engine/subtitles/renderer';
import { parseSubRip } from '../engine/subtitles/srt';
import { parseWebVTT } from '../engine/subtitles/vtt';
import { parseASS } from '../engine/subtitles/ass';
import { AudioDSPManager } from '../engine/audio';
import { MediaSessionAdapter } from '../os/mediasession';
import type { SubtitleTrack, MediaItem } from '../core/types';

export class CimoApp {
  private controller!: MediaController;
  private videoEngine!: VideoEngine;
  private hud!: FloatingHUD;
  private gestures!: GestureEngine;
  private drawer!: LibraryDrawer;
  private shortcuts!: ShortcutEngine;
  private subtitleRenderer!: SubtitleRenderer;
  private audioDSP?: AudioDSPManager;
  private mediaSession?: MediaSessionAdapter;

  private isInitialized: boolean = false;

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Video Element & Video Engine
    const videoEl = document.getElementById('cimo-video') as HTMLVideoElement;
    const videoStage = document.getElementById('video-stage') as HTMLElement;
    const hudEl = document.getElementById('floating-hud') as HTMLElement;
    const titlebarEl = document.getElementById('custom-titlebar') as HTMLElement;
    const drawerEl = document.getElementById('library-drawer') as HTMLElement;
    const gestureHudEl = document.getElementById('gesture-feedback-hud') as HTMLElement;
    const subtitleOverlayEl = document.getElementById('subtitle-overlay') as HTMLElement;

    this.videoEngine = new VideoEngine({
      videoElement: videoEl,
      containerElement: videoStage,
    });

    // 2. Core Controller
    this.controller = new MediaController({
      videoEngine: this.videoEngine,
      onSaveResumePosition: (item, pos, dur) => {
        try {
          localStorage.setItem(`cimo_resume_${item.uri}`, JSON.stringify({ pos, dur, time: Date.now() }));
        } catch {
          // ignore localstorage error
        }
      },
    });

    // 3. Subtitle Renderer
    this.subtitleRenderer = new SubtitleRenderer({
      container: subtitleOverlayEl,
    });

    // 4. Audio DSP (WebAudio)
    try {
      this.audioDSP = new AudioDSPManager({
        mediaElement: videoEl,
      });
    } catch (e) {
      console.warn('WebAudio DSP initialization deferred or unsupported in this context:', e);
    }

    // 5. Floating HUD
    this.hud = new FloatingHUD(this.controller, {
      hudElement: hudEl,
      titlebarElement: titlebarEl,
      videoStageElement: videoStage,
      onSelectSubtitleFile: () => this.triggerSubtitleFilePicker(),
      onToggleDrawer: () => this.drawer.toggle(),
      onToggleFullscreen: () => this.toggleFullscreen(),
      onTogglePiP: () => this.videoEngine.togglePictureInPicture(),
    });

    // 6. Gestures Engine
    this.gestures = new GestureEngine(this.controller, {
      stageElement: videoStage,
      feedbackHudElement: gestureHudEl,
    });

    // 7. Library Drawer
    this.drawer = new LibraryDrawer(this.controller, {
      drawerElement: drawerEl,
      onOpenFiles: () => this.triggerMediaFilePicker(),
      onOpenFolder: () => this.triggerFolderPicker(),
    });

    // 8. Shortcuts Engine
    this.shortcuts = new ShortcutEngine(this.controller, (customAction) => {
      if (customAction === 'toggleFullscreen') {
        this.toggleFullscreen();
      } else if (customAction === 'toggleDrawer') {
        this.drawer.toggle();
      } else if (customAction === 'togglePiP') {
        this.videoEngine.togglePictureInPicture();
      } else if (customAction === 'escape') {
        if (this.drawer.isDrawerOpen()) {
          this.drawer.close();
        } else if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }
    });

    // 9. OS MediaSession Integration
    this.mediaSession = new MediaSessionAdapter(this.controller);

    // 10. Bind DOM Events & Listeners
    this.bindWindowEvents();
    this.bindDragAndDrop();
    this.bindFileInputs();
    this.bindSubtitleUpdates();

    this.isInitialized = true;
    console.log('Cimo Media Player initialized successfully.');
  }

  public getController(): MediaController {
    return this.controller;
  }

  public toggleFullscreen(): void {
    const appEl = document.getElementById('cimo-app');
    if (!document.fullscreenElement) {
      if (appEl?.requestFullscreen) {
        appEl.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => console.warn('Exit fullscreen error:', err));
      }
    }
  }

  private bindWindowEvents(): void {
    // Global Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      const handled = this.shortcuts.handleKeyDown(e);
      if (handled) {
        e.preventDefault();
      }
    });

    // Titlebar top buttons
    document.getElementById('btn-open-file-top')?.addEventListener('click', () => {
      this.triggerMediaFilePicker();
    });
    document.getElementById('btn-top-drawer')?.addEventListener('click', () => {
      this.drawer.toggle();
    });
  }

  private bindDragAndDrop(): void {
    const overlay = document.getElementById('drag-drop-overlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      overlay?.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        overlay?.classList.remove('active');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', async (e) => {
      e.preventDefault();
      dragCounter = 0;
      overlay?.classList.remove('active');

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      const mediaFiles: File[] = [];
      const subtitleFiles: File[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (['srt', 'vtt', 'ass', 'ssa'].includes(ext)) {
          subtitleFiles.push(file);
        } else {
          mediaFiles.push(file);
        }
      }

      // Load subtitle files
      for (const subFile of subtitleFiles) {
        await this.loadSubtitleFromFile(subFile);
      }

      // Load media files
      if (mediaFiles.length > 0) {
        const items: MediaItem[] = mediaFiles.map((file) => ({
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uri: URL.createObjectURL(file),
          title: file.name,
          duration: 0,
          addedAt: Date.now(),
        }));

        this.controller.setQueue(items, 0);
      }
    });
  }

  private bindFileInputs(): void {
    const mediaInput = document.getElementById('file-input-media') as HTMLInputElement;
    const subInput = document.getElementById('file-input-subtitles') as HTMLInputElement;

    mediaInput?.addEventListener('change', () => {
      const files = mediaInput.files;
      if (files && files.length > 0) {
        const items: MediaItem[] = Array.from(files).map((file) => ({
          id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uri: URL.createObjectURL(file),
          title: file.name,
          duration: 0,
          addedAt: Date.now(),
        }));
        this.controller.setQueue(items, 0);
      }
      mediaInput.value = '';
    });

    subInput?.addEventListener('change', async () => {
      const files = subInput.files;
      if (files && files.length > 0) {
        await this.loadSubtitleFromFile(files[0]);
      }
      subInput.value = '';
    });
  }

  public triggerMediaFilePicker(): void {
    const input = document.getElementById('file-input-media') as HTMLInputElement;
    input?.click();
  }

  public triggerFolderPicker(): void {
    const input = document.getElementById('file-input-media') as HTMLInputElement;
    if (input) {
      input.setAttribute('webkitdirectory', 'true');
      input.click();
      input.removeAttribute('webkitdirectory');
    }
  }

  public triggerSubtitleFilePicker(): void {
    const input = document.getElementById('file-input-subtitles') as HTMLInputElement;
    input?.click();
  }

  public async loadSubtitleFromFile(file: File): Promise<void> {
    const content = await file.text();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';

    let format: SubtitleTrack['format'] = 'srt';
    let cues = [];

    if (ext === 'vtt') {
      format = 'vtt';
      cues = parseWebVTT(content);
    } else if (ext === 'ass' || ext === 'ssa') {
      format = 'ass';
      cues = parseASS(content);
    } else {
      format = 'srt';
      cues = parseSubRip(content);
    }

    const trackId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const newTrack: SubtitleTrack = {
      id: trackId,
      label: file.name,
      format,
      cues,
    };

    const existingTracks = this.controller.getState().subtitleTracks;
    this.controller.setSubtitleTracks([...existingTracks, newTrack]);
    this.controller.setSubtitleTrack(trackId);
    this.hud.renderSubtitlesMenu();
  }

  private bindSubtitleUpdates(): void {
    const video = this.videoEngine.getVideoElement();

    if (video) {
      video.addEventListener('timeupdate', () => {
        const currentTime = video.currentTime;
        const state = this.controller.getState();
        this.controller.updateTime(currentTime, video.duration, video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0);

        // Update active subtitle cues
        const activeTrack = state.subtitleTracks.find((t) => t.id === state.selectedSubtitleTrackId);
        if (activeTrack) {
          const cues = this.subtitleRenderer.update(activeTrack, currentTime, state.subtitleOffset);
          this.controller.setActiveCues(cues);
        } else {
          this.subtitleRenderer.clear();
          this.controller.setActiveCues([]);
        }
      });

      video.addEventListener('loadedmetadata', () => {
        this.controller.updateTime(video.currentTime, video.duration);
      });

      video.addEventListener('ended', () => {
        this.controller.next();
      });
    }

    this.controller.on('subtitletrackselected', (trackId) => {
      if (!trackId) {
        this.subtitleRenderer.clear();
      }
    });
  }
}

// Auto-initialize if running in browser DOM
if (typeof document !== 'undefined' && document.getElementById('cimo-app')) {
  const app = new CimoApp();
  document.addEventListener('DOMContentLoaded', () => {
    app.init();
  });
}
