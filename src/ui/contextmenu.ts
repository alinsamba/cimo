import type { IMediaController, AspectRatio, RepeatMode } from '../core/types';
import { captureVideoSnapshot } from './snapshot';
import type { ToastManager } from './toast';

export interface ContextMenuConfig {
  stageElement: HTMLElement;
  controller: IMediaController;
  toastManager?: ToastManager;
  onOpenSubtitleFile?: () => void;
  onOpenAudioFile?: () => void;
  onShowMediaInfo?: () => void;
}

export class ContextMenuManager {
  private stage: HTMLElement;
  private controller: IMediaController;
  private toast?: ToastManager;
  private menuElement: HTMLElement | null = null;
  private isOpen: boolean = false;
  private touchTimer: number | null = null;
  private touchCoords: { x: number; y: number } = { x: 0, y: 0 };

  private onOpenSubtitleFile?: () => void;
  private onOpenAudioFile?: () => void;
  private onShowMediaInfo?: () => void;

  private hwAccelEnabled: boolean = true;
  private deinterlacingMode: 'auto' | 'off' | 'yadif' = 'auto';

  constructor(config: ContextMenuConfig) {
    this.stage = config.stageElement;
    this.controller = config.controller;
    this.toast = config.toastManager;
    this.onOpenSubtitleFile = config.onOpenSubtitleFile;
    this.onOpenAudioFile = config.onOpenAudioFile;
    this.onShowMediaInfo = config.onShowMediaInfo;

    this.bindTriggers();
  }

  public open(x: number, y: number): void {
    this.close();

    const menu = document.createElement('div');
    menu.className = 'dynamic-context-menu';
    menu.id = 'dynamic-context-menu';

    menu.innerHTML = this.buildMenuHtml();
    document.body.appendChild(menu);
    this.menuElement = menu;
    this.isOpen = true;

    // Position menu within viewport bounds
    const rect = menu.getBoundingClientRect();
    const maxX = window.innerWidth - rect.width - 10;
    const maxY = window.innerHeight - rect.height - 10;

    const posX = Math.min(x, Math.max(10, maxX));
    const posY = Math.min(y, Math.max(10, maxY));

    menu.style.left = `${posX}px`;
    menu.style.top = `${posY}px`;

    this.bindMenuInteractions(menu);
  }

  public close(): void {
    if (this.menuElement) {
      this.menuElement.remove();
      this.menuElement = null;
    }
    this.isOpen = false;
  }

  private bindTriggers(): void {
    // Desktop Right-Click
    this.stage.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.open(e.clientX, e.clientY);
    });

    // Keyboard Menu Key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ContextMenu') {
        e.preventDefault();
        const rect = this.stage.getBoundingClientRect();
        this.open(rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // Mobile / Touchscreen Long-Press (>450ms)
    this.stage.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          const t = e.touches[0];
          this.touchCoords = { x: t.clientX, y: t.clientY };
          this.touchTimer = setTimeout(() => {
            this.open(this.touchCoords.x, this.touchCoords.y);
          }, 450) as unknown as number;
        }
      },
      { passive: true }
    );

    this.stage.addEventListener(
      'touchmove',
      (e) => {
        if (this.touchTimer) {
          const t = e.touches[0];
          if (Math.hypot(t.clientX - this.touchCoords.x, t.clientY - this.touchCoords.y) > 10) {
            clearTimeout(this.touchTimer);
            this.touchTimer = null;
          }
        }
      },
      { passive: true }
    );

    this.stage.addEventListener(
      'touchend',
      () => {
        if (this.touchTimer) {
          clearTimeout(this.touchTimer);
          this.touchTimer = null;
        }
      },
      { passive: true }
    );

    // Close on click outside
    document.addEventListener('click', (e) => {
      if (this.isOpen && this.menuElement && !this.menuElement.contains(e.target as Node)) {
        this.close();
      }
    });
  }

  private buildMenuHtml(): string {
    const state = this.controller.getState();
    const isPlaying = state.status === 'playing';
    const currentRate = state.playbackRate;
    const currentRatio = state.aspectRatio;
    const currentRepeat = state.repeatMode;
    const currentSubId = state.selectedSubtitleTrackId;
    const currentAudioId = state.selectedAudioTrackId;

    return `
      <!-- Playback Submenu -->
      <div class="cmenu-item cmenu-has-submenu">
        <span class="cmenu-label">▶ Playback</span>
        <span class="cmenu-arrow">›</span>
        <div class="cmenu-submenu">
          <div class="cmenu-item" data-action="toggle-play">
            <span>${isPlaying ? 'Pause' : 'Play'}</span>
            <span class="cmenu-shortcut">Space</span>
          </div>
          <div class="cmenu-item" data-action="step-frame">
            <span>Step 1 Frame</span>
            <span class="cmenu-shortcut">E</span>
          </div>
          <div class="cmenu-divider"></div>
          <div class="cmenu-header">Speed Presets</div>
          ${[0.5, 0.75, 1.0, 1.25, 1.5, 2.0]
            .map(
              (s) => `
            <div class="cmenu-item ${currentRate === s ? 'cmenu-checked' : ''}" data-action="speed" data-value="${s}">
              <span>${s}x</span>
              ${currentRate === s ? '<span>✓</span>' : ''}
            </div>
          `
            )
            .join('')}
          <div class="cmenu-divider"></div>
          <div class="cmenu-header">Loop Mode</div>
          ${(['off', 'one', 'all'] as RepeatMode[])
            .map(
              (m) => `
            <div class="cmenu-item ${currentRepeat === m ? 'cmenu-checked' : ''}" data-action="repeat" data-value="${m}">
              <span>${m === 'off' ? 'Loop Off' : m === 'one' ? 'Repeat Current' : 'Repeat All'}</span>
              ${currentRepeat === m ? '<span>✓</span>' : ''}
            </div>
          `
            )
            .join('')}
          <div class="cmenu-divider"></div>
          <div class="cmenu-header">Aspect Ratio</div>
          ${(['contain', '16:9', '4:3', '21:9', 'fill', 'cover'] as AspectRatio[])
            .map(
              (r) => `
            <div class="cmenu-item ${currentRatio === r ? 'cmenu-checked' : ''}" data-action="aspect" data-value="${r}">
              <span>${r.toUpperCase()}</span>
              ${currentRatio === r ? '<span>✓</span>' : ''}
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Audio Submenu -->
      <div class="cmenu-item cmenu-has-submenu">
        <span class="cmenu-label">🔊 Audio</span>
        <span class="cmenu-arrow">›</span>
        <div class="cmenu-submenu">
          <div class="cmenu-header">Audio Tracks</div>
          ${
            state.audioTracks.length === 0
              ? `<div class="cmenu-item cmenu-checked" data-action="audio-track" data-value="default"><span>Default Track</span><span>✓</span></div>`
              : state.audioTracks
                  .map(
                    (t) => `
              <div class="cmenu-item ${currentAudioId === t.id ? 'cmenu-checked' : ''}" data-action="audio-track" data-value="${t.id}">
                <span>${this.escapeHtml(t.label)}</span>
                ${currentAudioId === t.id ? '<span>✓</span>' : ''}
              </div>
            `
                  )
                  .join('')
          }
          <div class="cmenu-divider"></div>
          <div class="cmenu-item" data-action="load-audio-file">
            <span>Load External Audio...</span>
          </div>
          <div class="cmenu-item" data-action="audio-offset-minus">
            <span>Audio Delay -50ms</span>
          </div>
          <div class="cmenu-item" data-action="audio-offset-plus">
            <span>Audio Delay +50ms</span>
          </div>
        </div>
      </div>

      <!-- Subtitles Submenu -->
      <div class="cmenu-item cmenu-has-submenu">
        <span class="cmenu-label">💬 Subtitles</span>
        <span class="cmenu-arrow">›</span>
        <div class="cmenu-submenu">
          <div class="cmenu-item ${!currentSubId ? 'cmenu-checked' : ''}" data-action="sub-track" data-value="none">
            <span>Off</span>
            ${!currentSubId ? '<span>✓</span>' : ''}
          </div>
          ${state.subtitleTracks
            .map(
              (t) => `
            <div class="cmenu-item ${currentSubId === t.id ? 'cmenu-checked' : ''}" data-action="sub-track" data-value="${t.id}">
              <span>${this.escapeHtml(t.label)} (${t.format.toUpperCase()})</span>
              ${currentSubId === t.id ? '<span>✓</span>' : ''}
            </div>
          `
            )
            .join('')}
          <div class="cmenu-divider"></div>
          <div class="cmenu-item" data-action="load-sub-file">
            <span>Load Subtitle File...</span>
          </div>
          <div class="cmenu-item" data-action="sub-delay-minus">
            <span>Subtitle Delay -50ms</span>
            <span class="cmenu-shortcut">Z</span>
          </div>
          <div class="cmenu-item" data-action="sub-delay-plus">
            <span>Subtitle Delay +50ms</span>
            <span class="cmenu-shortcut">X</span>
          </div>
        </div>
      </div>

      <!-- Video Processing Submenu -->
      <div class="cmenu-item cmenu-has-submenu">
        <span class="cmenu-label">⚙️ Video Processing</span>
        <span class="cmenu-arrow">›</span>
        <div class="cmenu-submenu">
          <div class="cmenu-item ${this.hwAccelEnabled ? 'cmenu-checked' : ''}" data-action="toggle-hw-accel">
            <span>Hardware Acceleration</span>
            <span>${this.hwAccelEnabled ? '✓ Enabled' : 'Disabled'}</span>
          </div>
          <div class="cmenu-divider"></div>
          <div class="cmenu-header">Deinterlacing</div>
          <div class="cmenu-item ${this.deinterlacingMode === 'auto' ? 'cmenu-checked' : ''}" data-action="deinterlace" data-value="auto">
            <span>Auto</span>
            ${this.deinterlacingMode === 'auto' ? '<span>✓</span>' : ''}
          </div>
          <div class="cmenu-item ${this.deinterlacingMode === 'yadif' ? 'cmenu-checked' : ''}" data-action="deinterlace" data-value="yadif">
            <span>Yadif 2x</span>
            ${this.deinterlacingMode === 'yadif' ? '<span>✓</span>' : ''}
          </div>
          <div class="cmenu-item ${this.deinterlacingMode === 'off' ? 'cmenu-checked' : ''}" data-action="deinterlace" data-value="off">
            <span>Off</span>
            ${this.deinterlacingMode === 'off' ? '<span>✓</span>' : ''}
          </div>
          <div class="cmenu-divider"></div>
          <div class="cmenu-item" data-action="capture-snapshot">
            <span>📸 Capture Frame / Snapshot</span>
          </div>
        </div>
      </div>

      <div class="cmenu-divider"></div>

      <!-- File Info & Actions -->
      <div class="cmenu-item" data-action="media-info">
        <span>ℹ️ File & Media Properties</span>
      </div>
      <div class="cmenu-item" data-action="copy-path">
        <span>📋 Copy Media Path</span>
      </div>
    `;
  }

  private bindMenuInteractions(menu: HTMLElement): void {
    menu.querySelectorAll('.cmenu-item').forEach((item) => {
      item.addEventListener('click', async (e) => {
        const el = item as HTMLElement;
        const action = el.dataset.action;
        const val = el.dataset.value;

        if (!action) return;

        switch (action) {
          case 'toggle-play':
            await this.controller.togglePlay();
            break;
          case 'step-frame':
            this.controller.stepFrame(true);
            this.toast?.show('Stepped 1 frame forward', { icon: '⏩' });
            break;
          case 'speed':
            if (val) {
              const speed = parseFloat(val);
              this.controller.setPlaybackRate(speed);
              this.toast?.show(`Speed: ${speed}x`, { icon: '⚡' });
            }
            break;
          case 'repeat':
            if (val) {
              this.controller.setRepeatMode(val as RepeatMode);
              this.toast?.show(`Loop: ${val.toUpperCase()}`, { icon: '🔁' });
            }
            break;
          case 'aspect':
            if (val) {
              this.controller.setAspectRatio(val as AspectRatio);
              this.toast?.show(`Aspect: ${val.toUpperCase()}`, { icon: '📐' });
            }
            break;
          case 'audio-track':
            if (val) {
              this.controller.setAudioTrack(val === 'default' ? null : val);
              this.toast?.show('Audio track switched', { icon: '🔊' });
            }
            break;
          case 'load-audio-file':
            this.onOpenAudioFile?.();
            break;
          case 'sub-track':
            if (val) {
              this.controller.setSubtitleTrack(val === 'none' ? null : val);
              this.toast?.show(val === 'none' ? 'Subtitles: Off' : 'Subtitles switched', { icon: '💬' });
            }
            break;
          case 'load-sub-file':
            this.onOpenSubtitleFile?.();
            break;
          case 'sub-delay-minus':
            this.controller.setSubtitleOffset(this.controller.getState().subtitleOffset - 0.05);
            this.toast?.show(`Subtitle Delay: ${Math.round(this.controller.getState().subtitleOffset * 1000)}ms`, { icon: '💬' });
            break;
          case 'sub-delay-plus':
            this.controller.setSubtitleOffset(this.controller.getState().subtitleOffset + 0.05);
            this.toast?.show(`Subtitle Delay: ${Math.round(this.controller.getState().subtitleOffset * 1000)}ms`, { icon: '💬' });
            break;
          case 'toggle-hw-accel':
            this.hwAccelEnabled = !this.hwAccelEnabled;
            this.toast?.show(`Hardware Acceleration: ${this.hwAccelEnabled ? 'Enabled' : 'Disabled'}`, { icon: '⚡' });
            break;
          case 'deinterlace':
            if (val) {
              this.deinterlacingMode = val as 'auto' | 'off' | 'yadif';
              this.toast?.show(`Deinterlacing: ${val.toUpperCase()}`, { icon: '📺' });
            }
            break;
          case 'capture-snapshot': {
            const video = this.stage.querySelector('video') as HTMLVideoElement | null;
            if (video) {
              const res = await captureVideoSnapshot(video, this.controller.getState().currentMedia?.title);
              if (res.success) {
                this.toast?.show(`Snapshot saved (${res.filename})`, { icon: '📸' });
              } else {
                this.toast?.show(res.error || 'Failed to capture snapshot', { icon: '⚠️' });
              }
            }
            break;
          }
          case 'media-info':
            this.onShowMediaInfo?.();
            break;
          case 'copy-path': {
            const path = this.controller.getState().currentMedia?.path || this.controller.getState().currentMedia?.uri || '';
            if (path && navigator.clipboard) {
              await navigator.clipboard.writeText(path);
              this.toast?.show('Media path copied to clipboard', { icon: '📋' });
            }
            break;
          }
        }

        this.close();
      });
    });
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
