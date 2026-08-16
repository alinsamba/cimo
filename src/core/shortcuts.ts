import type { IMediaController, AspectRatio, RepeatMode } from './types';

export interface ShortcutDefinition {
  id: string;
  key: string; // e.g. "Space", "KeyK", "ArrowLeft", "KeyF"
  code?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  category: 'playback' | 'navigation' | 'audio' | 'subtitles' | 'view';
  action: (controller: IMediaController) => void | Promise<void>;
}

export interface RebindResult {
  success: boolean;
  error?: string;
}

const RESERVED_OS_SHORTCUTS = new Set([
  'ctrl+w',
  'ctrl+q',
  'ctrl+r',
  'ctrl+t',
  'ctrl+n',
  'ctrl+alt+del',
  'ctrl+shift+i',
  'ctrl+shift+j',
  'f5',
  'f12',
]);

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];

export class ShortcutEngine {
  private shortcuts: Map<string, ShortcutDefinition> = new Map();
  private controller: IMediaController;
  private enabled: boolean = true;
  private onCustomAction?: (actionName: string) => void;
  private onToast?: (message: string, icon?: string) => void;

  constructor(
    controller: IMediaController,
    onCustomAction?: (actionName: string) => void,
    onToast?: (message: string, icon?: string) => void
  ) {
    this.controller = controller;
    this.onCustomAction = onCustomAction;
    this.onToast = onToast;
    this.registerDefaultShortcuts();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public register(shortcut: ShortcutDefinition): void {
    this.shortcuts.set(shortcut.id, shortcut);
  }

  public getShortcuts(): ShortcutDefinition[] {
    return Array.from(this.shortcuts.values());
  }

  public rebind(
    id: string,
    newKey: string,
    modifiers?: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean }
  ): RebindResult {
    const existing = this.shortcuts.get(id);
    if (!existing) {
      return { success: false, error: `Shortcut ID "${id}" not found` };
    }

    const keyLower = newKey.toLowerCase();
    const isCtrl = !!modifiers?.ctrl;
    const isShift = !!modifiers?.shift;
    const isAlt = !!modifiers?.alt;

    // Check against reserved OS shortcuts
    const comboKey = `${isCtrl ? 'ctrl+' : ''}${isAlt ? 'alt+' : ''}${isShift ? 'shift+' : ''}${keyLower}`;
    if (RESERVED_OS_SHORTCUTS.has(comboKey)) {
      return { success: false, error: `Key combination "${comboKey}" is reserved by the OS` };
    }

    // Collision check
    for (const [otherId, other] of this.shortcuts.entries()) {
      if (otherId === id) continue;
      const sameKey = other.key.toLowerCase() === keyLower;
      const sameCtrl = !!other.ctrl === isCtrl;
      const sameShift = !!other.shift === isShift;
      const sameAlt = !!other.alt === isAlt;

      if (sameKey && sameCtrl && sameShift && sameAlt) {
        return {
          success: false,
          error: `Collision with existing shortcut "${other.description}" (${otherId})`,
        };
      }
    }

    existing.key = newKey;
    existing.ctrl = isCtrl;
    existing.shift = isShift;
    existing.alt = isAlt;
    existing.meta = !!modifiers?.meta;

    return { success: true };
  }

  public exportKeymap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [id, s] of this.shortcuts.entries()) {
      const parts: string[] = [];
      if (s.ctrl) parts.push('Ctrl');
      if (s.alt) parts.push('Alt');
      if (s.shift) parts.push('Shift');
      if (s.meta) parts.push('Meta');
      parts.push(s.key);
      map[id] = parts.join('+');
    }
    return map;
  }

  public importKeymap(keymap: Record<string, string>): void {
    for (const [id, combo] of Object.entries(keymap)) {
      const parts = combo.split('+');
      const key = parts.pop() || '';
      const ctrl = parts.includes('Ctrl');
      const alt = parts.includes('Alt');
      const shift = parts.includes('Shift');
      const meta = parts.includes('Meta');
      this.rebind(id, key, { ctrl, alt, shift, meta });
    }
  }

  public resetToDefault(): void {
    this.shortcuts.clear();
    this.registerDefaultShortcuts();
  }

  public handleKeyDown(event: {
    key: string;
    code?: string;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    target?: unknown;
  }): boolean {
    if (!this.enabled) return false;

    // Ignore when typing inside input/textarea/editable elements
    const target = event.target as { tagName?: string; isContentEditable?: boolean } | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
      return false;
    }

    const key = event.key.toLowerCase();
    const code = event.code?.toLowerCase();
    const ctrl = !!event.ctrlKey;
    const shift = !!event.shiftKey;
    const alt = !!event.altKey;
    const meta = !!event.metaKey;

    for (const shortcut of this.shortcuts.values()) {
      const matchKey =
        shortcut.key.toLowerCase() === key ||
        (shortcut.code && shortcut.code.toLowerCase() === code) ||
        (shortcut.key.toLowerCase() === 'space' && key === ' ') ||
        (shortcut.key === '<' && key === '<') ||
        (shortcut.key === '>' && key === '>');

      const matchCtrl = !!shortcut.ctrl === ctrl;
      const matchShift = !!shortcut.shift === shift;
      const matchAlt = !!shortcut.alt === alt;
      const matchMeta = !!shortcut.meta === meta;

      if (matchKey && matchCtrl && matchShift && matchAlt && matchMeta) {
        try {
          shortcut.action(this.controller);
        } catch (err) {
          console.error(`Error executing shortcut "${shortcut.description}":`, err);
        }
        return true;
      }
    }

    return false;
  }

  private registerDefaultShortcuts(): void {
    // 1. Play / Pause (Space / K)
    this.register({
      id: 'play_pause_space',
      key: ' ',
      code: 'Space',
      description: 'Toggle Play/Pause',
      category: 'playback',
      action: async (ctrl) => {
        await ctrl.togglePlay();
      },
    });
    this.register({
      id: 'play_pause_k',
      key: 'k',
      code: 'KeyK',
      description: 'Toggle Play/Pause',
      category: 'playback',
      action: async (ctrl) => {
        await ctrl.togglePlay();
      },
    });

    // 2. Short Seek (±5s): Left / Right Arrow, J / L
    this.register({
      id: 'seek_back_short_arrow',
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      description: 'Short Seek Backward (-5s)',
      category: 'navigation',
      action: (ctrl) => {
        ctrl.seekRelative(-5);
        this.onToast?.('Seek: -5s', '⏪');
      },
    });
    this.register({
      id: 'seek_fwd_short_arrow',
      key: 'ArrowRight',
      code: 'ArrowRight',
      description: 'Short Seek Forward (+5s)',
      category: 'navigation',
      action: (ctrl) => {
        ctrl.seekRelative(5);
        this.onToast?.('Seek: +5s', '⏩');
      },
    });
    this.register({
      id: 'seek_back_short_j',
      key: 'j',
      code: 'KeyJ',
      description: 'Short Seek Backward (-5s)',
      category: 'navigation',
      action: (ctrl) => {
        ctrl.seekRelative(-5);
        this.onToast?.('Seek: -5s', '⏪');
      },
    });

    // 3. Medium Seek (±30s): Shift + Left/Right, [ / ]
    this.register({
      id: 'seek_back_med_shift_arrow',
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      shift: true,
      description: 'Medium Seek Backward (-30s)',
      category: 'navigation',
      action: (ctrl) => {
        ctrl.seekRelative(-30);
        this.onToast?.('Seek: -30s', '⏪');
      },
    });
    this.register({
      id: 'seek_fwd_med_shift_arrow',
      key: 'ArrowRight',
      code: 'ArrowRight',
      shift: true,
      description: 'Medium Seek Forward (+30s)',
      category: 'navigation',
      action: (ctrl) => {
        ctrl.seekRelative(30);
        this.onToast?.('Seek: +30s', '⏩');
      },
    });
    this.register({
      id: 'seek_back_med_bracket',
      key: '[',
      code: 'BracketLeft',
      description: 'Medium Seek Backward (-30s)',
      category: 'navigation',
      action: (ctrl) => {
        ctrl.seekRelative(-30);
        this.onToast?.('Seek: -30s', '⏪');
      },
    });
    this.register({
      id: 'seek_fwd_med_bracket',
      key: ']',
      code: 'BracketRight',
      description: 'Medium Seek Forward (+30s)',
      category: 'navigation',
      action: (ctrl) => {
        ctrl.seekRelative(30);
        this.onToast?.('Seek: +30s', '⏩');
      },
    });

    // 4. Volume Adjustment (Up/Down Arrow ±5%)
    this.register({
      id: 'volume_up',
      key: 'ArrowUp',
      code: 'ArrowUp',
      description: 'Volume Up (+5%)',
      category: 'audio',
      action: (ctrl) => {
        const cur = ctrl.getState().volume;
        const next = Math.min(2.0, Math.round((cur + 0.05) * 100) / 100);
        ctrl.setVolume(next);
        const icon = next > 1.0 ? '🔊⚡' : '🔊';
        this.onToast?.(`Volume: ${Math.round(next * 100)}%`, icon);
      },
    });
    this.register({
      id: 'volume_down',
      key: 'ArrowDown',
      code: 'ArrowDown',
      description: 'Volume Down (-5%)',
      category: 'audio',
      action: (ctrl) => {
        const cur = ctrl.getState().volume;
        const next = Math.max(0.0, Math.round((cur - 0.05) * 100) / 100);
        ctrl.setVolume(next);
        const icon = next === 0 ? '🔇' : '🔉';
        this.onToast?.(`Volume: ${Math.round(next * 100)}%`, icon);
      },
    });

    // 5. Fullscreen Toggle (F)
    this.register({
      id: 'fullscreen_f',
      key: 'f',
      code: 'KeyF',
      description: 'Toggle Fullscreen',
      category: 'view',
      action: () => this.onCustomAction?.('toggleFullscreen'),
    });

    // 6. Mute / Unmute (M)
    this.register({
      id: 'mute_toggle',
      key: 'm',
      code: 'KeyM',
      description: 'Toggle Mute',
      category: 'audio',
      action: (ctrl) => {
        ctrl.toggleMute();
        const isMuted = ctrl.getState().muted;
        this.onToast?.(isMuted ? 'Muted' : 'Unmuted', isMuted ? '🔇' : '🔊');
      },
    });

    // 7. Playback Speed: < / > (Shift + , / Shift + .)
    this.register({
      id: 'speed_decrease',
      key: '<',
      code: 'Comma',
      shift: true,
      description: 'Decrease Playback Speed',
      category: 'playback',
      action: (ctrl) => {
        const cur = ctrl.getState().playbackRate;
        const lower = SPEED_PRESETS.filter((s) => s < cur);
        const next = lower.length > 0 ? lower[lower.length - 1] : 0.5;
        ctrl.setPlaybackRate(next);
        this.onToast?.(`Speed: ${next}x`, '⚡');
      },
    });
    this.register({
      id: 'speed_increase',
      key: '>',
      code: 'Period',
      shift: true,
      description: 'Increase Playback Speed',
      category: 'playback',
      action: (ctrl) => {
        const cur = ctrl.getState().playbackRate;
        const higher = SPEED_PRESETS.filter((s) => s > cur);
        const next = higher.length > 0 ? higher[0] : 2.0;
        ctrl.setPlaybackRate(next);
        this.onToast?.(`Speed: ${next}x`, '⚡');
      },
    });

    // 8. Audio Track Cycle (B)
    this.register({
      id: 'audio_cycle_b',
      key: 'b',
      code: 'KeyB',
      description: 'Cycle Audio Tracks',
      category: 'audio',
      action: (ctrl) => {
        const state = ctrl.getState();
        const tracks = state.audioTracks;
        if (tracks.length <= 1) {
          this.onToast?.('Audio: Default Track', '🔊');
          return;
        }
        const currentId = state.selectedAudioTrackId;
        const idx = tracks.findIndex((t) => t.id === currentId);
        const nextIdx = idx === -1 || idx === tracks.length - 1 ? 0 : idx + 1;
        const selected = tracks[nextIdx];
        ctrl.setAudioTrack(selected.id);
        this.onToast?.(`Audio: ${selected.label}`, '🔊');
      },
    });

    // 9. Subtitle Track Cycle (V / S)
    this.register({
      id: 'sub_cycle_v',
      key: 'v',
      code: 'KeyV',
      description: 'Cycle Subtitles',
      category: 'subtitles',
      action: (ctrl) => {
        const state = ctrl.getState();
        const tracks = state.subtitleTracks;
        if (tracks.length === 0) {
          this.onToast?.('Subtitles: None Available', '💬');
          return;
        }
        const currentId = state.selectedSubtitleTrackId;
        if (!currentId) {
          ctrl.setSubtitleTrack(tracks[0].id);
          this.onToast?.(`Subtitles: ${tracks[0].label}`, '💬');
        } else {
          const idx = tracks.findIndex((t) => t.id === currentId);
          if (idx === -1 || idx === tracks.length - 1) {
            ctrl.setSubtitleTrack(null);
            this.onToast?.('Subtitles: Off', '💬');
          } else {
            const next = tracks[idx + 1];
            ctrl.setSubtitleTrack(next.id);
            this.onToast?.(`Subtitles: ${next.label}`, '💬');
          }
        }
      },
    });
    this.register({
      id: 'sub_cycle_s',
      key: 's',
      code: 'KeyS',
      description: 'Cycle Subtitles',
      category: 'subtitles',
      action: (ctrl) => {
        const state = ctrl.getState();
        const tracks = state.subtitleTracks;
        if (tracks.length === 0) return;
        const currentId = state.selectedSubtitleTrackId;
        if (!currentId) {
          ctrl.setSubtitleTrack(tracks[0].id);
          this.onToast?.(`Subtitles: ${tracks[0].label}`, '💬');
        } else {
          const idx = tracks.findIndex((t) => t.id === currentId);
          if (idx === -1 || idx === tracks.length - 1) {
            ctrl.setSubtitleTrack(null);
            this.onToast?.('Subtitles: Off', '💬');
          } else {
            const next = tracks[idx + 1];
            ctrl.setSubtitleTrack(next.id);
            this.onToast?.(`Subtitles: ${next.label}`, '💬');
          }
        }
      },
    });

    // 10. Frame Step (E / Comma / Period)
    this.register({
      id: 'step_frame_e',
      key: 'e',
      code: 'KeyE',
      description: 'Step 1 Frame Forward',
      category: 'playback',
      action: (ctrl) => {
        ctrl.stepFrame(true);
        this.onToast?.('Frame Step +1', '⏩');
      },
    });
    this.register({
      id: 'step_frame_comma',
      key: ',',
      code: 'Comma',
      description: 'Step 1 Frame Backward',
      category: 'playback',
      action: (ctrl) => {
        ctrl.stepFrame(false);
      },
    });
    this.register({
      id: 'step_frame_period',
      key: '.',
      code: 'Period',
      description: 'Step 1 Frame Forward',
      category: 'playback',
      action: (ctrl) => {
        ctrl.stepFrame(true);
      },
    });

    // 11. Drawer Toggle (Tab / L / D)
    this.register({
      id: 'drawer_toggle_tab',
      key: 'Tab',
      code: 'Tab',
      description: 'Toggle Library Drawer',
      category: 'view',
      action: () => this.onCustomAction?.('toggleDrawer'),
    });
    this.register({
      id: 'drawer_toggle_d',
      key: 'd',
      code: 'KeyD',
      description: 'Toggle Library Drawer',
      category: 'view',
      action: () => this.onCustomAction?.('toggleDrawer'),
    });
    this.register({
      id: 'drawer_toggle_l',
      key: 'l',
      code: 'KeyL',
      description: 'Toggle Library Drawer / Skip',
      category: 'view',
      action: () => this.onCustomAction?.('toggleDrawer'),
    });

    // 12. Escape
    this.register({
      id: 'escape',
      key: 'Escape',
      code: 'Escape',
      description: 'Exit Fullscreen / Close Drawer',
      category: 'view',
      action: () => this.onCustomAction?.('escape'),
    });

    // 13. Picture-in-Picture (P)
    this.register({
      id: 'pip_toggle',
      key: 'p',
      code: 'KeyP',
      description: 'Toggle Picture-in-Picture',
      category: 'view',
      action: () => this.onCustomAction?.('togglePiP'),
    });
  }
}
