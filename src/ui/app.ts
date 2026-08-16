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
import { ToastManager } from './toast';
import { ContextMenuManager } from './contextmenu';
import { computeMediaFingerprint } from '../core/fingerprint';
import { SmartResumeTracker, type PlaybackResumeState } from '../core/resume';
import type { SubtitleTrack, MediaItem } from '../core/types';

declare global {
  interface Window {
    __cimoApp?: CimoApp;
  }
}

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
  private toast!: ToastManager;
  private contextMenu!: ContextMenuManager;
  private resumeTracker!: SmartResumeTracker;

  private isInitialized: boolean = false;
  private currentFileHash: string | null = null;

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. DOM Elements
    const videoEl = document.getElementById('cimo-video') as HTMLVideoElement;
    const videoStage = document.getElementById('video-stage') as HTMLElement;
    const hudEl = document.getElementById('floating-hud') as HTMLElement;
    const titlebarEl = document.getElementById('custom-titlebar') as HTMLElement;
    const drawerEl = document.getElementById('library-drawer') as HTMLElement;
    const gestureHudEl = document.getElementById('gesture-feedback-hud') as HTMLElement;
    const subtitleOverlayEl = document.getElementById('subtitle-overlay') as HTMLElement;

    // 2. Toast System
    this.toast = new ToastManager();

    // 3. Smart Resume Tracker
    this.resumeTracker = new SmartResumeTracker(async (state) => {
      await this.saveResumeState(state);
    });

    // 4. Video Engine
    this.videoEngine = new VideoEngine({
      videoElement: videoEl,
      containerElement: videoStage,
    });

    // 5. Core Controller
    this.controller = new MediaController({
      videoEngine: this.videoEngine,
    });

    // 6. Subtitle Renderer
    this.subtitleRenderer = new SubtitleRenderer({
      container: subtitleOverlayEl,
    });

    // 7. Audio DSP (WebAudio)
    try {
      this.audioDSP = new AudioDSPManager({
        mediaElement: videoEl,
      });
    } catch (e) {
      console.warn('WebAudio DSP initialization deferred or unsupported in this context:', e);
    }

    // 8. Floating HUD
    this.hud = new FloatingHUD(this.controller, {
      hudElement: hudEl,
      titlebarElement: titlebarEl,
      videoStageElement: videoStage,
      onSelectSubtitleFile: () => this.triggerSubtitleFilePicker(),
      onToggleDrawer: () => this.drawer.toggle(),
      onToggleFullscreen: () => this.toggleFullscreen(),
      onTogglePiP: () => this.videoEngine.togglePictureInPicture(),
    });

    // 9. Gestures Engine
    this.gestures = new GestureEngine(this.controller, {
      stageElement: videoStage,
      feedbackHudElement: gestureHudEl,
    });

    // 10. Library Drawer
    this.drawer = new LibraryDrawer(this.controller, {
      drawerElement: drawerEl,
      onOpenFiles: () => this.triggerMediaFilePicker(),
      onOpenFolder: () => this.triggerFolderPicker(),
      onGetHistory: async () => {
        try {
          const res = await fetch('/api/history');
          const data = await res.json();
          return data.history || [];
        } catch {
          return [];
        }
      },
      onClearHistory: async () => {
        try {
          await fetch('/api/history', { method: 'DELETE' });
        } catch {}
      },
      onGetPlaylists: async () => {
        try {
          const res = await fetch('/api/playlists');
          const data = await res.json();
          return data.playlists || [];
        } catch {
          return [];
        }
      },
      onCreatePlaylist: async (name: string) => {
        const res = await fetch('/api/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const data = await res.json();
        return data.playlist;
      },
      onLoadPlaylist: async (id: string) => {
        try {
          const res = await fetch(`/api/playlists/${id}`);
          const data = await res.json();
          if (data.items && data.items.length > 0) {
            this.controller.setQueue(data.items, 0);
          }
        } catch {}
      },
      onGetAllMedia: async (search?: string) => {
        try {
          const url = search ? `/api/media?search=${encodeURIComponent(search)}` : '/api/media';
          const res = await fetch(url);
          const data = await res.json();
          return data.items || [];
        } catch {
          return [];
        }
      },
    });

    // 11. Dynamic Context Menu
    this.contextMenu = new ContextMenuManager({
      stageElement: videoStage,
      controller: this.controller,
      toastManager: this.toast,
      onOpenSubtitleFile: () => this.triggerSubtitleFilePicker(),
      onOpenAudioFile: () => this.triggerMediaFilePicker(),
      onShowMediaInfo: () => this.showMediaPropertiesModal(),
    });

    // 12. Shortcuts Engine with Toast Visuals
    this.shortcuts = new ShortcutEngine(
      this.controller,
      (customAction) => {
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
      },
      (message, icon) => {
        this.toast.show(message, { icon });
      }
    );

    // 13. OS MediaSession Integration
    this.mediaSession = new MediaSessionAdapter(this.controller);

    // 14. Bind Window Events & Media Listeners
    this.bindWindowEvents();
    this.bindDragAndDrop();
    this.bindFileInputs();
    this.bindSubtitleUpdates();
    this.bindPlaybackResumeHooks();
    this.bindThemeSensing();

    this.controller.on('mediachange', (media) => {
      if (media) {
        videoStage.classList.add('has-media');
      } else {
        videoStage.classList.remove('has-media');
      }
    });

    this.controller.on('statuschange', (status) => {
      if (status === 'playing') {
        videoStage.classList.add('playing');
      } else {
        videoStage.classList.remove('playing');
      }
    });

    window.__cimoApp = this;
    this.isInitialized = true;
    console.log('Cimo Media Player initialized successfully.');
  }

  public getController(): MediaController {
    return this.controller;
  }

  public getToast(): ToastManager {
    return this.toast;
  }

  public toggleFullscreen(): void {
    const appEl = document.getElementById('cimo-app');
    if (!document.fullscreenElement) {
      if (appEl?.requestFullscreen) {
        appEl.requestFullscreen().catch((err) => console.warn('Fullscreen error:', err));
        this.toast.show('Fullscreen On', { icon: '⛶' });
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch((err) => console.warn('Exit fullscreen error:', err));
        this.toast.show('Fullscreen Off', { icon: '⛶' });
      }
    }
  }

  private bindWindowEvents(): void {
    // Global Keyboard shortcuts interception
    window.addEventListener('keydown', (e) => {
      const handled = this.shortcuts.handleKeyDown(e);
      if (handled) {
        e.preventDefault();
      }
    });

    // Viewport mouse wheel volume scroll (±5%)
    const videoStage = document.getElementById('video-stage');
    videoStage?.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        const current = this.controller.getState().volume;
        const next = Math.max(0.0, Math.min(2.0, Math.round((current + delta) * 100) / 100));
        this.controller.setVolume(next);
        const icon = next > 1.0 ? '🔊⚡' : next === 0 ? '🔇' : '🔊';
        this.toast.show(`Volume: ${Math.round(next * 100)}%`, { icon });
      },
      { passive: false }
    );

    // Viewport double click for fullscreen
    videoStage?.addEventListener('dblclick', (e) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'VIDEO' || target === videoStage) {
        this.toggleFullscreen();
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

  private bindThemeSensing(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateThemeAndWatermark = (isDark: boolean) => {
      const watermarkImg = document.getElementById('watermark-image') as HTMLImageElement | null;
      if (watermarkImg) {
        watermarkImg.src = isDark ? '/watermark-white.png' : '/watermark-black.png';
      }
    };

    updateThemeAndWatermark(darkQuery.matches);

    try {
      darkQuery.addEventListener('change', (e) => {
        updateThemeAndWatermark(e.matches);
      });
    } catch {
      darkQuery.addListener?.((e) => {
        updateThemeAndWatermark(e.matches);
      });
    }
  }

  private bindPlaybackResumeHooks(): void {
    const video = this.videoEngine.getVideoElement();

    this.controller.on('mediachange', async (media) => {
      if (!media) return;

      const hash = await computeMediaFingerprint(media.path || media.uri);
      this.currentFileHash = hash;
      this.resumeTracker.setMedia(hash, media.duration || 0);

      // Check saved resume state
      const savedState = await this.getResumeState(hash);
      if (savedState && savedState.positionMs > 0 && !savedState.completed) {
        const posSeconds = savedState.positionMs / 1000;
        this.controller.seek(posSeconds);

        const timeStr = this.formatTime(posSeconds);
        this.toast.showResumeToast(timeStr, () => {
          this.controller.seek(0);
          this.toast.show('Playing from beginning', { icon: '⏪' });
        });
      }
    });

    if (video) {
      video.addEventListener('timeupdate', () => {
        if (this.currentFileHash) {
          this.resumeTracker.updatePlayback(video.currentTime, !video.paused, video.duration);
        }
      });

      video.addEventListener('pause', () => {
        const state = this.controller.getState();
        this.resumeTracker.onPauseOrExit(
          state.selectedAudioTrackId ?? undefined,
          state.selectedSubtitleTrackId ?? undefined,
          state.volume
        );
      });
    }

    window.addEventListener('beforeunload', () => {
      this.resumeTracker.flush();
    });
  }

  private async saveResumeState(state: PlaybackResumeState): Promise<void> {
    try {
      localStorage.setItem(`cimo_state_${state.fileHash}`, JSON.stringify(state));
      await fetch('/api/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: state.fileHash,
          uri: state.fileHash,
          title: this.controller.getState().currentMedia?.title || 'Media File',
          position: state.positionMs / 1000,
          duration: state.durationMs / 1000,
        }),
      });
    } catch {
      // ignore
    }
  }

  private async getResumeState(fileHash: string): Promise<PlaybackResumeState | null> {
    try {
      const local = localStorage.getItem(`cimo_state_${fileHash}`);
      if (local) {
        return JSON.parse(local) as PlaybackResumeState;
      }
    } catch {
      // ignore
    }
    return null;
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

      for (const subFile of subtitleFiles) {
        await this.loadSubtitleFromFile(subFile);
        this.toast.show(`Loaded subtitles: ${subFile.name}`, { icon: '💬' });
      }

      if (mediaFiles.length > 0) {
        const items: MediaItem[] = mediaFiles.map((file) => ({
          id: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          uri: URL.createObjectURL(file),
          title: file.name,
          duration: 0,
          addedAt: Date.now(),
        }));

        this.controller.setQueue(items, 0);
        this.toast.show(`Loaded ${mediaFiles.length} file(s)`, { icon: '📂' });
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
        this.toast.show(`Loaded: ${files[0].name}`, { icon: '💬' });
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
        this.controller.updateTime(
          currentTime,
          video.duration,
          video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0
        );

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

  public showMediaPropertiesModal(): void {
    const media = this.controller.getState().currentMedia;
    const video = this.videoEngine.getVideoElement();

    const title = media?.title || 'Unknown Media';
    const uri = media?.path || media?.uri || 'Local Stream';
    const duration = this.formatTime(this.controller.getState().duration);
    const resolution = video ? `${video.videoWidth}x${video.videoHeight}` : 'Auto';
    const volume = `${Math.round(this.controller.getState().volume * 100)}%`;
    const speed = `${this.controller.getState().playbackRate}x`;

    const existing = document.getElementById('media-properties-modal');
    existing?.remove();

    const modal = document.createElement('div');
    modal.id = 'media-properties-modal';
    modal.className = 'item-info-modal';
    modal.style.zIndex = '120';
    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
        <span style="font-weight: 700; font-size: 0.95rem;">Media & File Properties</span>
        <button id="btn-close-prop-modal" class="btn-icon" style="min-width: 24px; height: 24px; padding: 0;">✕</button>
      </div>
      <div class="info-row">
        <span class="info-label">Title:</span>
        <span class="info-value" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(title)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Duration:</span>
        <span class="info-value">${duration}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Resolution:</span>
        <span class="info-value">${resolution}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Volume:</span>
        <span class="info-value">${volume}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Speed:</span>
        <span class="info-value">${speed}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Source:</span>
        <span class="info-value" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(uri)}">${this.escapeHtml(uri)}</span>
      </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#btn-close-prop-modal')?.addEventListener('click', () => modal.remove());
    const onOutside = (e: MouseEvent) => {
      if (!modal.contains(e.target as Node)) {
        modal.remove();
        document.removeEventListener('click', onOutside);
      }
    };
    setTimeout(() => document.addEventListener('click', onOutside), 10);
  }

  private formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Auto-initialize if running in browser DOM
if (typeof document !== 'undefined' && document.getElementById('cimo-app')) {
  const app = new CimoApp();
  document.addEventListener('DOMContentLoaded', () => {
    app.init();
  });
}
