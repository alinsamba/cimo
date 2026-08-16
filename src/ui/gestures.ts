import type { IMediaController } from '../core/types';

export interface GesturesConfig {
  stageElement: HTMLElement;
  feedbackHudElement?: HTMLElement;
  onBrightnessChange?: (brightness: number) => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  zone: 'left' | 'right' | 'center';
  gestureType: 'none' | 'vertical-brightness' | 'vertical-volume' | 'horizontal-seek' | 'pinch';
  initialVolume: number;
  initialBrightness: number;
  initialTime: number;
  seekDelta: number;
  touchCount: number;
  initialPinchDistance: number;
}

export class GestureEngine {
  private controller: IMediaController;
  private stage: HTMLElement;
  private feedbackHud?: HTMLElement;
  private onBrightnessChange?: (brightness: number) => void;

  private brightness: number = 1.0; // 0.0 - 1.0
  private touchState: TouchState | null = null;
  private lastTapTime: number = 0;
  private lastTapX: number = 0;
  private lastTapY: number = 0;
  private doubleTapThresholdMs: number = 300;
  private feedbackTimeout: number | null = null;

  constructor(controller: IMediaController, config: GesturesConfig) {
    this.controller = controller;
    this.stage = config.stageElement;
    this.feedbackHud = config.feedbackHudElement;
    this.onBrightnessChange = config.onBrightnessChange;

    this.bindTouchEvents();
  }

  public setBrightness(level: number): void {
    this.brightness = Math.max(0.1, Math.min(1.0, level));
    const video = this.stage.querySelector('video') as HTMLVideoElement | null;
    if (video) {
      video.style.filter = `brightness(${this.brightness})`;
    }
    this.onBrightnessChange?.(this.brightness);
  }

  public getBrightness(): number {
    return this.brightness;
  }

  private bindTouchEvents(): void {
    this.stage.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    this.stage.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    this.stage.addEventListener('touchend', (e) => this.handleTouchEnd(e), { passive: false });
    this.stage.addEventListener('touchcancel', () => this.handleTouchCancel());
  }

  private handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = this.stage.getBoundingClientRect();
      const relativeX = touch.clientX - rect.left;
      const width = rect.width;

      let zone: 'left' | 'right' | 'center' = 'center';
      if (relativeX < width * 0.3) {
        zone = 'left';
      } else if (relativeX > width * 0.7) {
        zone = 'right';
      }

      this.touchState = {
        startX: touch.clientX,
        startY: touch.clientY,
        startTime: Date.now(),
        lastX: touch.clientX,
        lastY: touch.clientY,
        zone,
        gestureType: 'none',
        initialVolume: this.controller.getState().volume,
        initialBrightness: this.brightness,
        initialTime: this.controller.getState().currentTime,
        seekDelta: 0,
        touchCount: 1,
        initialPinchDistance: 0,
      };
    } else if (e.touches.length === 2) {
      // Pinch gesture start
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      this.touchState = {
        startX: (t1.clientX + t2.clientX) / 2,
        startY: (t1.clientY + t2.clientY) / 2,
        startTime: Date.now(),
        lastX: (t1.clientX + t2.clientX) / 2,
        lastY: (t1.clientY + t2.clientY) / 2,
        zone: 'center',
        gestureType: 'pinch',
        initialVolume: this.controller.getState().volume,
        initialBrightness: this.brightness,
        initialTime: this.controller.getState().currentTime,
        seekDelta: 0,
        touchCount: 2,
        initialPinchDistance: distance,
      };
    }
  }

  private handleTouchMove(e: TouchEvent): void {
    if (!this.touchState) return;

    if (e.touches.length === 1 && this.touchState.touchCount === 1) {
      const touch = e.touches[0];
      const deltaX = touch.clientX - this.touchState.startX;
      const deltaY = touch.clientY - this.touchState.startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Determine gesture direction if not locked
      if (this.touchState.gestureType === 'none') {
        const threshold = 12;
        if (absY > threshold && absY > absX * 1.2) {
          if (this.touchState.zone === 'left') {
            this.touchState.gestureType = 'vertical-brightness';
          } else if (this.touchState.zone === 'right') {
            this.touchState.gestureType = 'vertical-volume';
          }
        } else if (absX > threshold && absX > absY * 1.2) {
          this.touchState.gestureType = 'horizontal-seek';
        }
      }

      // Execute locked gesture
      if (this.touchState.gestureType === 'vertical-brightness') {
        e.preventDefault();
        const stageHeight = this.stage.clientHeight || 400;
        const normalizedDelta = -deltaY / stageHeight;
        const targetBrightness = Math.max(0.1, Math.min(1.0, this.touchState.initialBrightness + normalizedDelta));
        this.setBrightness(targetBrightness);
        const sunSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
        this.showFeedback(sunSvg, `Brightness ${Math.round(targetBrightness * 100)}%`, targetBrightness);
      } else if (this.touchState.gestureType === 'vertical-volume') {
        e.preventDefault();
        const stageHeight = this.stage.clientHeight || 400;
        const normalizedDelta = (-deltaY / stageHeight) * 2.0; // scale to 200% volume
        const targetVolume = Math.max(0.0, Math.min(2.0, this.touchState.initialVolume + normalizedDelta));
        this.controller.setVolume(targetVolume);
        const volSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`;
        this.showFeedback(volSvg, `Volume ${Math.round(targetVolume * 100)}%`, targetVolume / 2.0);
      } else if (this.touchState.gestureType === 'horizontal-seek') {
        e.preventDefault();
        const stageWidth = this.stage.clientWidth || 600;
        const seekRate = 90; // max +/- 90 seconds swipe
        const deltaSeconds = Math.round((deltaX / stageWidth) * seekRate);
        this.touchState.seekDelta = deltaSeconds;
        const targetTime = Math.max(
          0,
          Math.min(
            this.controller.getState().duration,
            this.touchState.initialTime + deltaSeconds
          )
        );
        const sign = deltaSeconds >= 0 ? '+' : '';
        const seekSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>`;
        this.showFeedback(seekSvg, `${sign}${deltaSeconds}s (${this.formatTime(targetTime)})`, targetTime / (this.controller.getState().duration || 1));
      }
    }
  }

  private handleTouchEnd(e: TouchEvent): void {
    if (!this.touchState) return;

    const now = Date.now();
    const touchDuration = now - this.touchState.startTime;

    // Finalize seek gesture
    if (this.touchState.gestureType === 'horizontal-seek' && this.touchState.seekDelta !== 0) {
      const targetTime = Math.max(
        0,
        Math.min(
          this.controller.getState().duration,
          this.touchState.initialTime + this.touchState.seekDelta
        )
      );
      this.controller.seek(targetTime);
    } else if (this.touchState.gestureType === 'none' && touchDuration < 250) {
      // Tap detection (single or double tap)
      const touch = e.changedTouches[0];
      const tapX = touch.clientX;
      const tapY = touch.clientY;
      const isDoubleTap =
        now - this.lastTapTime < this.doubleTapThresholdMs &&
        Math.hypot(tapX - this.lastTapX, tapY - this.lastTapY) < 40;

      if (isDoubleTap) {
        this.handleDoubleTap(tapX);
        this.lastTapTime = 0; // reset
      } else {
        this.lastTapTime = now;
        this.lastTapX = tapX;
        this.lastTapY = tapY;
      }
    }

    this.touchState = null;
    this.hideFeedbackAfterDelay();
  }

  private handleTouchCancel(): void {
    this.touchState = null;
    this.hideFeedback();
  }

  private handleDoubleTap(clientX: number): void {
    const rect = this.stage.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const width = rect.width;

    if (relativeX < width * 0.35) {
      // Double tap left: seek -10s
      this.controller.seekRelative(-10);
      const backSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><text x="12" y="15.2" text-anchor="middle" font-size="8" font-family="var(--font-mono)" font-weight="700" fill="currentColor" stroke="none">10</text></svg>`;
      this.showFeedback(backSvg, '-10s');
    } else if (relativeX > width * 0.65) {
      // Double tap right: seek +10s
      this.controller.seekRelative(10);
      const fwdSvg = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><text x="12" y="15.2" text-anchor="middle" font-size="8" font-family="var(--font-mono)" font-weight="700" fill="currentColor" stroke="none">10</text></svg>`;
      this.showFeedback(fwdSvg, '+10s');
    } else {
      // Double tap center: toggle play/pause
      this.controller.togglePlay();
      const isPlaying = this.controller.getState().status === 'playing';
      const playSvg = isPlaying
        ? `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>`
        : `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      this.showFeedback(playSvg, isPlaying ? 'Pause' : 'Play');
    }
  }

  private showFeedback(icon: string, label: string, progressFraction?: number): void {
    if (!this.feedbackHud) return;

    if (this.feedbackTimeout !== null) {
      clearTimeout(this.feedbackTimeout);
      this.feedbackTimeout = null;
    }

    const iconEl = this.feedbackHud.querySelector('.gesture-icon') as HTMLElement | null;
    const labelEl = this.feedbackHud.querySelector('.gesture-label') as HTMLElement | null;
    const fillEl = this.feedbackHud.querySelector('.gesture-bar-fill') as HTMLElement | null;

    if (iconEl) iconEl.innerHTML = icon;
    if (labelEl) labelEl.textContent = label;
    if (fillEl && typeof progressFraction === 'number') {
      fillEl.style.width = `${Math.round(progressFraction * 100)}%`;
    }
    this.feedbackHud.classList.add('visible');
  }

  private hideFeedbackAfterDelay(): void {
    if (this.feedbackTimeout !== null) {
      clearTimeout(this.feedbackTimeout);
    }
    this.feedbackTimeout = setTimeout(() => {
      this.hideFeedback();
    }, 600) as unknown as number;
  }

  private hideFeedback(): void {
    this.feedbackHud?.classList.remove('visible');
  }

  private formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}
