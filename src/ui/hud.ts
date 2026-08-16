import type { IMediaController, PlayerState, SubtitleTrack, AudioTrack, AspectRatio } from '../core/types';
import { parseMediaDisplayTitle } from '../core/title';

export interface HUDConfig {
  hudElement: HTMLElement;
  titlebarElement?: HTMLElement;
  videoStageElement: HTMLElement;
  idleTimeoutMs?: number;
  onSelectSubtitleFile?: () => void;
  onToggleDrawer?: () => void;
  onToggleFullscreen?: () => void;
  onTogglePiP?: () => void;
}

export class FloatingHUD {
  private controller: IMediaController;
  private hudElement: HTMLElement;
  private titlebarElement?: HTMLElement;
  private videoStageElement: HTMLElement;
  private idleTimeoutMs: number;
  private idleTimer: number | null = null;
  private isHoveringHUD: boolean = false;
  private isScrubbing: boolean = false;
  private isVolumeDragging: boolean = false;

  private onSelectSubtitleFile?: () => void;
  private onToggleDrawer?: () => void;
  private onToggleFullscreen?: () => void;
  private onTogglePiP?: () => void;

  // DOM element references
  private elements: {
    playPauseBtn?: HTMLButtonElement;
    prevBtn?: HTMLButtonElement;
    nextBtn?: HTMLButtonElement;
    skipBackBtn?: HTMLButtonElement;
    skipFwdBtn?: HTMLButtonElement;
    timeCurrent?: HTMLElement;
    timeDuration?: HTMLElement;
    scrubberContainer?: HTMLElement;
    scrubberPlayed?: HTMLElement;
    scrubberBuffered?: HTMLElement;
    scrubberThumb?: HTMLElement;
    scrubberTooltip?: HTMLElement;
    volumeBtn?: HTMLButtonElement;
    volumeSliderContainer?: HTMLElement;
    volumeSliderFill?: HTMLElement;
    volumeTooltip?: HTMLElement;
    speedBtn?: HTMLButtonElement;
    speedMenu?: HTMLElement;
    subtitlesBtn?: HTMLButtonElement;
    subtitlesMenu?: HTMLElement;
    audioBtn?: HTMLButtonElement;
    audioMenu?: HTMLElement;
    aspectRatioBtn?: HTMLButtonElement;
    aspectRatioMenu?: HTMLElement;
    fullscreenBtn?: HTMLButtonElement;
    pipBtn?: HTMLButtonElement;
    mediaTitleDisplay?: HTMLElement;
    mediaBadgesContainer?: HTMLElement;
  } = {};

  constructor(controller: IMediaController, config: HUDConfig) {
    this.controller = controller;
    this.hudElement = config.hudElement;
    this.titlebarElement = config.titlebarElement;
    this.videoStageElement = config.videoStageElement;
    this.idleTimeoutMs = config.idleTimeoutMs || 1800;

    this.onSelectSubtitleFile = config.onSelectSubtitleFile;
    this.onToggleDrawer = config.onToggleDrawer;
    this.onToggleFullscreen = config.onToggleFullscreen;
    this.onTogglePiP = config.onTogglePiP;

    this.queryElements();
    this.bindEvents();
    this.bindControllerListeners();
    this.resetIdleTimer();
  }

  public show(): void {
    this.hudElement.classList.remove('hidden');
    this.titlebarElement?.classList.remove('hidden');
    this.videoStageElement.classList.remove('idle');
    this.resetIdleTimer();
  }

  public hide(): void {
    if (this.isHoveringHUD || this.isScrubbing || this.isVolumeDragging) return;
    this.hudElement.classList.add('hidden');
    this.titlebarElement?.classList.add('hidden');
    this.videoStageElement.classList.add('idle');
    this.closeAllPopovers();
  }

  public closeAllPopovers(): void {
    const popovers = this.hudElement.querySelectorAll('.popover-menu');
    popovers.forEach((p) => p.classList.remove('open'));
  }

  public resetIdleTimer(): void {
    if (this.idleTimer !== null) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    this.hudElement.classList.remove('hidden');
    this.titlebarElement?.classList.remove('hidden');
    this.videoStageElement.classList.remove('idle');

    if (!this.isHoveringHUD && !this.isScrubbing && !this.isVolumeDragging) {
      this.idleTimer = setTimeout(() => {
        const state = this.controller.getState();
        if (state.status === 'playing') {
          this.hide();
        }
      }, this.idleTimeoutMs) as unknown as number;
    }
  }

  public formatTime(seconds: number): string {
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

  private queryElements(): void {
    const root = this.hudElement;
    this.elements.playPauseBtn = root.querySelector('#btn-play-pause') as HTMLButtonElement;
    this.elements.prevBtn = root.querySelector('#btn-prev') as HTMLButtonElement;
    this.elements.nextBtn = root.querySelector('#btn-next') as HTMLButtonElement;
    this.elements.skipBackBtn = root.querySelector('#btn-skip-back') as HTMLButtonElement;
    this.elements.skipFwdBtn = root.querySelector('#btn-skip-fwd') as HTMLButtonElement;
    this.elements.timeCurrent = root.querySelector('#time-current') as HTMLElement;
    this.elements.timeDuration = root.querySelector('#time-duration') as HTMLElement;
    this.elements.scrubberContainer = root.querySelector('#scrubber-container') as HTMLElement;
    this.elements.scrubberPlayed = root.querySelector('#scrubber-played') as HTMLElement;
    this.elements.scrubberBuffered = root.querySelector('#scrubber-buffered') as HTMLElement;
    this.elements.scrubberThumb = root.querySelector('#scrubber-thumb') as HTMLElement;
    this.elements.scrubberTooltip = root.querySelector('#scrubber-tooltip') as HTMLElement;
    this.elements.volumeBtn = root.querySelector('#btn-volume') as HTMLButtonElement;
    this.elements.volumeSliderContainer = root.querySelector('#volume-slider-container') as HTMLElement;
    this.elements.volumeSliderFill = root.querySelector('#volume-slider-fill') as HTMLElement;
    this.elements.volumeTooltip = root.querySelector('#volume-tooltip') as HTMLElement;
    this.elements.speedBtn = root.querySelector('#btn-speed') as HTMLButtonElement;
    this.elements.speedMenu = root.querySelector('#speed-menu') as HTMLElement;
    this.elements.subtitlesBtn = root.querySelector('#btn-subtitles') as HTMLButtonElement;
    this.elements.subtitlesMenu = root.querySelector('#subtitles-menu') as HTMLElement;
    this.elements.audioBtn = root.querySelector('#btn-audio') as HTMLButtonElement;
    this.elements.audioMenu = root.querySelector('#audio-menu') as HTMLElement;
    this.elements.aspectRatioBtn = root.querySelector('#btn-aspect-ratio') as HTMLButtonElement;
    this.elements.aspectRatioMenu = root.querySelector('#aspect-ratio-menu') as HTMLElement;
    this.elements.fullscreenBtn = root.querySelector('#btn-fullscreen') as HTMLButtonElement;
    this.elements.pipBtn = root.querySelector('#btn-pip') as HTMLButtonElement;

    if (this.titlebarElement) {
      this.elements.mediaTitleDisplay = this.titlebarElement.querySelector('#media-title-display') as HTMLElement;
      this.elements.mediaBadgesContainer = this.titlebarElement.querySelector('#media-badges-container') as HTMLElement;
    }
  }

  private bindEvents(): void {
    // Activity tracking on video stage
    this.videoStageElement.addEventListener('mousemove', () => this.resetIdleTimer());
    this.videoStageElement.addEventListener('click', (e) => {
      if (e.target === this.videoStageElement || (e.target as HTMLElement).tagName === 'VIDEO') {
        this.controller.togglePlay();
      }
    });

    // Hover detection on HUD
    this.hudElement.addEventListener('mouseenter', () => {
      this.isHoveringHUD = true;
      this.resetIdleTimer();
    });
    this.hudElement.addEventListener('mouseleave', () => {
      this.isHoveringHUD = false;
      this.resetIdleTimer();
    });

    // Play/Pause
    this.elements.playPauseBtn?.addEventListener('click', () => {
      this.controller.togglePlay();
    });

    // Prev / Next
    this.elements.prevBtn?.addEventListener('click', () => this.controller.previous());
    this.elements.nextBtn?.addEventListener('click', () => this.controller.next());

    // Skip -10s / +10s
    this.elements.skipBackBtn?.addEventListener('click', () => this.controller.seekRelative(-10));
    this.elements.skipFwdBtn?.addEventListener('click', () => this.controller.seekRelative(10));

    // Volume button (Mute toggle)
    this.elements.volumeBtn?.addEventListener('click', () => this.controller.toggleMute());

    // Volume Slider
    this.setupVolumeSlider();

    // Scrubber
    this.setupScrubber();

    // Speed Popover
    this.setupSpeedMenu();

    // Subtitles Popover
    this.setupSubtitlesMenu();

    // Audio Tracks Popover
    this.setupAudioMenu();

    // Aspect Ratio Popover
    this.setupAspectRatioMenu();

    // Fullscreen / PiP
    this.elements.fullscreenBtn?.addEventListener('click', () => this.onToggleFullscreen?.());
    this.elements.pipBtn?.addEventListener('click', () => this.onTogglePiP?.());

    // Close popovers on click outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.popover-container')) {
        this.closeAllPopovers();
      }
    });
  }

  private setupScrubber(): void {
    const container = this.elements.scrubberContainer;
    const tooltip = this.elements.scrubberTooltip;
    if (!container) return;

    const handleSeek = (e: MouseEvent | TouchEvent) => {
      const rect = container.getBoundingClientRect();
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const duration = this.controller.getState().duration;
      if (duration > 0) {
        this.controller.seek(fraction * duration);
      }
    };

    container.addEventListener('mousedown', (e) => {
      this.isScrubbing = true;
      handleSeek(e);

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (this.isScrubbing) {
          handleSeek(moveEvent);
          updateTooltip(moveEvent);
        }
      };

      const onMouseUp = () => {
        this.isScrubbing = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        this.resetIdleTimer();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    const updateTooltip = (e: MouseEvent) => {
      if (!tooltip) return;
      const rect = container.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const duration = this.controller.getState().duration;
      const targetSecs = fraction * (duration || 0);

      tooltip.textContent = this.formatTime(targetSecs);
      tooltip.style.left = `${fraction * 100}%`;
    };

    container.addEventListener('mousemove', updateTooltip);
  }

  private setupVolumeSlider(): void {
    const container = this.elements.volumeSliderContainer;
    if (!container) return;

    const handleVolumeChange = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const targetVolume = Math.round(fraction * 200) / 100; // 0.0 to 2.0
      this.controller.setVolume(targetVolume);
    };

    container.addEventListener('mousedown', (e) => {
      this.isVolumeDragging = true;
      handleVolumeChange(e);

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (this.isVolumeDragging) {
          handleVolumeChange(moveEvent);
        }
      };

      const onMouseUp = () => {
        this.isVolumeDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        this.resetIdleTimer();
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  }

  private setupSpeedMenu(): void {
    const btn = this.elements.speedBtn;
    const menu = this.elements.speedMenu;
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      this.closeAllPopovers();
      if (!isOpen) menu.classList.add('open');
    });

    const speeds = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0, 4.0];
    menu.innerHTML = speeds
      .map((s) => `<div class="popover-item" data-speed="${s}">${s}x</div>`)
      .join('');

    menu.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.popover-item') as HTMLElement | null;
      if (item && item.dataset.speed) {
        const speed = parseFloat(item.dataset.speed);
        this.controller.setPlaybackRate(speed);
        menu.classList.remove('open');
      }
    });
  }

  private setupSubtitlesMenu(): void {
    const btn = this.elements.subtitlesBtn;
    const menu = this.elements.subtitlesMenu;
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      this.closeAllPopovers();
      if (!isOpen) {
        this.renderSubtitlesMenu();
        menu.classList.add('open');
      }
    });

    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.popover-item') as HTMLElement | null;
      if (!item) return;

      const trackId = item.dataset.trackId;
      if (trackId === 'none') {
        this.controller.setSubtitleTrack(null);
      } else if (trackId === 'load-file') {
        this.onSelectSubtitleFile?.();
      } else if (trackId) {
        this.controller.setSubtitleTrack(trackId);
      }
      menu.classList.remove('open');
    });
  }

  public renderSubtitlesMenu(): void {
    const menu = this.elements.subtitlesMenu;
    if (!menu) return;

    const state = this.controller.getState();
    const tracks = state.subtitleTracks;
    const selectedId = state.selectedSubtitleTrackId;

    let html = `
      <div class="popover-item ${!selectedId ? 'selected' : ''}" data-track-id="none">Off</div>
    `;

    tracks.forEach((track) => {
      const isSel = track.id === selectedId;
      html += `<div class="popover-item ${isSel ? 'selected' : ''}" data-track-id="${track.id}">${track.label} (${track.format.toUpperCase()})</div>`;
    });

    html += `
      <div style="height: 1px; background: var(--border-subtle); margin: 0.25rem 0;"></div>
      <div class="popover-item" data-track-id="load-file">Load Subtitle File...</div>
    `;

    menu.innerHTML = html;
  }

  private setupAudioMenu(): void {
    const btn = this.elements.audioBtn;
    const menu = this.elements.audioMenu;
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      this.closeAllPopovers();
      if (!isOpen) {
        this.renderAudioMenu();
        menu.classList.add('open');
      }
    });

    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.popover-item') as HTMLElement | null;
      if (!item) return;

      const trackId = item.dataset.trackId;
      if (trackId) {
        this.controller.setAudioTrack(trackId);
      }
      menu.classList.remove('open');
    });
  }

  public renderAudioMenu(): void {
    const menu = this.elements.audioMenu;
    if (!menu) return;

    const state = this.controller.getState();
    const tracks = state.audioTracks;
    const selectedId = state.selectedAudioTrackId;

    if (tracks.length === 0) {
      menu.innerHTML = `<div class="popover-item selected" data-track-id="default">Default Track</div>`;
      return;
    }

    menu.innerHTML = tracks
      .map((t) => {
        const isSel = t.id === selectedId;
        return `<div class="popover-item ${isSel ? 'selected' : ''}" data-track-id="${t.id}">${t.label}${t.channels ? ` (${t.channels}ch)` : ''}</div>`;
      })
      .join('');
  }

  private setupAspectRatioMenu(): void {
    const btn = this.elements.aspectRatioBtn;
    const menu = this.elements.aspectRatioMenu;
    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      this.closeAllPopovers();
      if (!isOpen) {
        this.renderAspectRatioMenu();
        menu.classList.add('open');
      }
    });

    menu.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const item = target.closest('.popover-item') as HTMLElement | null;
      if (!item) return;

      const ratio = item.dataset.ratio as AspectRatio;
      if (ratio) {
        this.controller.setAspectRatio(ratio);
      }
      menu.classList.remove('open');
    });
  }

  public renderAspectRatioMenu(): void {
    const menu = this.elements.aspectRatioMenu;
    if (!menu) return;

    const ratios: Array<{ id: AspectRatio; label: string; icon: string }> = [
      { id: 'contain', label: 'CONTAIN', icon: '' },
      {
        id: 'cover',
        label: 'COVER',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2v14a2 2 0 0 0 2 2h14"></path><path d="M18 22V8a2 2 0 0 0-2-2H2"></path></svg>',
      },
      {
        id: '16:9',
        label: '16:9',
        icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"></rect></svg>',
      },
      {
        id: '4:3',
        label: '4:3',
        icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"></rect></svg>',
      },
      {
        id: '21:9',
        label: '21:9',
        icon: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="7" width="22" height="10" rx="1.5"></rect></svg>',
      },
      {
        id: 'fill',
        label: 'FILL',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line><rect x="3" y="9" width="12" height="12" rx="2"></rect></svg>',
      },
      { id: 'original', label: 'ORIGINAL', icon: '' },
    ];
    const current = this.controller.getState().aspectRatio;

    menu.innerHTML = ratios
      .map((r) => {
        const isSel = r.id === current;
        return `
          <div class="popover-item ${isSel ? 'selected' : ''}" data-ratio="${r.id}">
            <span>${r.label}</span>
            ${r.icon ? `<span class="popover-glyph">${r.icon}</span>` : ''}
          </div>
        `;
      })
      .join('');
  }
  private bindControllerListeners(): void {
    // Media change
    const onMediaUpdate = (state: PlayerState) => {
      const rawTitle = state.currentMedia?.title || '';
      if (rawTitle) {
        const parsed = parseMediaDisplayTitle(rawTitle);
        if (this.elements.mediaTitleDisplay) {
          this.elements.mediaTitleDisplay.textContent = parsed.cleanTitle;
          this.elements.mediaTitleDisplay.title = rawTitle; // full title on tooltip
        }
        if (this.elements.mediaBadgesContainer) {
          this.elements.mediaBadgesContainer.innerHTML = parsed.badges
            .map((b) => `<span class="title-badge">${b}</span>`)
            .join('');
        }
      } else {
        if (this.elements.mediaTitleDisplay) {
          this.elements.mediaTitleDisplay.textContent = 'Cimo Player';
          this.elements.mediaTitleDisplay.title = '';
        }
        if (this.elements.mediaBadgesContainer) {
          this.elements.mediaBadgesContainer.innerHTML = '';
        }
      }

      if (this.elements.timeDuration) {
        this.elements.timeDuration.textContent = this.formatTime(state.duration);
      }
      this.updateStatusIcon(state.status);
    };

    // Time update
    const onTimeUpdate = (data: { currentTime: number; duration: number; buffered: number }) => {
      if (this.elements.timeCurrent) {
        this.elements.timeCurrent.textContent = this.formatTime(data.currentTime);
      }
      if (this.elements.timeDuration && data.duration > 0) {
        this.elements.timeDuration.textContent = this.formatTime(data.duration);
      }

      if (!this.isScrubbing && data.duration > 0) {
        const playedPct = (data.currentTime / data.duration) * 100;
        const bufferedPct = (data.buffered / data.duration) * 100;

        if (this.elements.scrubberPlayed) {
          this.elements.scrubberPlayed.style.width = `${playedPct}%`;
        }
        if (this.elements.scrubberThumb) {
          this.elements.scrubberThumb.style.left = `${playedPct}%`;
        }
        if (this.elements.scrubberBuffered) {
          this.elements.scrubberBuffered.style.width = `${bufferedPct}%`;
        }
      }
    };

    // Volume update
    const onVolumeUpdate = (data: { volume: number; muted: boolean }) => {
      const vol = data.muted ? 0 : data.volume;
      const pct = Math.round(vol * 100);

      if (this.elements.volumeTooltip) {
        this.elements.volumeTooltip.textContent = pct > 100 ? `${pct}% ⚡` : `${pct}%`;
        if (pct > 100) {
          this.elements.volumeTooltip.classList.add('boosted');
        } else {
          this.elements.volumeTooltip.classList.remove('boosted');
        }
      }

      if (this.elements.volumeSliderFill) {
        const fillWidth = Math.min(100, (vol / 2.0) * 100);
        this.elements.volumeSliderFill.style.width = `${fillWidth}%`;

        if (vol > 1.0) {
          this.elements.volumeSliderFill.classList.add('boosted');
        } else {
          this.elements.volumeSliderFill.classList.remove('boosted');
        }
      }
    };

    // Status change
    const onStatusChange = (status: PlayerState['status']) => {
      this.updateStatusIcon(status);
      if (status === 'playing') {
        this.resetIdleTimer();
      } else {
        this.show();
      }
    };

    // Rate change
    const onRateChange = (rate: number) => {
      if (this.elements.speedBtn) {
        this.elements.speedBtn.textContent = `${rate}x`;
      }
    };

    // Register with controller event emitter
    const emitter = this.controller as unknown as {
      on: (event: string, fn: (...args: unknown[]) => void) => void;
    };

    if (typeof emitter.on === 'function') {
      emitter.on('statechange', (s: unknown) => onMediaUpdate(s as PlayerState));
      emitter.on('timeupdate', (t: unknown) => onTimeUpdate(t as { currentTime: number; duration: number; buffered: number }));
      emitter.on('volumechange', (v: unknown) => onVolumeUpdate(v as { volume: number; muted: boolean }));
      emitter.on('statuschange', (st: unknown) => onStatusChange(st as PlayerState['status']));
      emitter.on('ratechange', (r: unknown) => onRateChange(r as number));
    }
  }

  private updateStatusIcon(status: PlayerState['status']): void {
    if (!this.elements.playPauseBtn) return;
    if (status === 'playing') {
      this.elements.playPauseBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1"></rect>
          <rect x="14" y="4" width="4" height="16" rx="1"></rect>
        </svg>
      `;
    } else {
      this.elements.playPauseBtn.innerHTML = `
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <polygon points="5 3 19 12 5 21 5 3"></polygon>
        </svg>
      `;
    }
  }
}
