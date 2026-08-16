import type { IMediaController, AspectRatio, RepeatMode } from './types';

export interface ShortcutDefinition {
  key: string; // e.g. "Space", "KeyK", "ArrowLeft", "KeyF"
  code?: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  meta?: boolean;
  description: string;
  action: (controller: IMediaController) => void | Promise<void>;
}

export class ShortcutEngine {
  private shortcuts: ShortcutDefinition[] = [];
  private controller: IMediaController;
  private enabled: boolean = true;
  private onCustomAction?: (actionName: string) => void;

  constructor(controller: IMediaController, onCustomAction?: (actionName: string) => void) {
    this.controller = controller;
    this.onCustomAction = onCustomAction;
    this.registerDefaultShortcuts();
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public register(shortcut: ShortcutDefinition): void {
    this.shortcuts.push(shortcut);
  }

  public getShortcuts(): ShortcutDefinition[] {
    return [...this.shortcuts];
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

    for (const shortcut of this.shortcuts) {
      const matchKey =
        shortcut.key.toLowerCase() === key ||
        (shortcut.code && shortcut.code.toLowerCase() === code) ||
        (shortcut.key.toLowerCase() === 'space' && key === ' ');

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
    // Play / Pause
    this.register({
      key: ' ',
      code: 'Space',
      description: 'Toggle Play/Pause',
      action: (ctrl) => ctrl.togglePlay(),
    });
    this.register({
      key: 'k',
      code: 'KeyK',
      description: 'Toggle Play/Pause',
      action: (ctrl) => ctrl.togglePlay(),
    });

    // Seek
    this.register({
      key: 'ArrowLeft',
      code: 'ArrowLeft',
      description: 'Seek backward 5s',
      action: (ctrl) => ctrl.seekRelative(-5),
    });
    this.register({
      key: 'ArrowRight',
      code: 'ArrowRight',
      description: 'Seek forward 5s',
      action: (ctrl) => ctrl.seekRelative(5),
    });
    this.register({
      key: 'j',
      code: 'KeyJ',
      description: 'Seek backward 10s',
      action: (ctrl) => ctrl.seekRelative(-10),
    });
    this.register({
      key: 'l',
      code: 'KeyL',
      description: 'Seek forward 10s',
      action: (ctrl) => ctrl.seekRelative(10),
    });

    // Volume
    this.register({
      key: 'ArrowUp',
      code: 'ArrowUp',
      description: 'Volume Up (+5%)',
      action: (ctrl) => {
        const current = ctrl.getState().volume;
        ctrl.setVolume(Math.min(2.0, Math.round((current + 0.05) * 100) / 100));
      },
    });
    this.register({
      key: 'ArrowDown',
      code: 'ArrowDown',
      description: 'Volume Down (-5%)',
      action: (ctrl) => {
        const current = ctrl.getState().volume;
        ctrl.setVolume(Math.max(0.0, Math.round((current - 0.05) * 100) / 100));
      },
    });
    this.register({
      key: 'm',
      code: 'KeyM',
      description: 'Toggle Mute',
      action: (ctrl) => ctrl.toggleMute(),
    });

    // Fullscreen / Custom triggers
    this.register({
      key: 'f',
      code: 'KeyF',
      description: 'Toggle Fullscreen',
      action: () => this.onCustomAction?.('toggleFullscreen'),
    });
    this.register({
      key: 'F11',
      code: 'F11',
      description: 'Toggle Fullscreen',
      action: () => this.onCustomAction?.('toggleFullscreen'),
    });
    this.register({
      key: 'Escape',
      code: 'Escape',
      description: 'Exit Fullscreen / Close Drawer',
      action: () => this.onCustomAction?.('escape'),
    });

    // Playback Speed
    this.register({
      key: '[',
      code: 'BracketLeft',
      description: 'Decrease Speed by 0.1x',
      action: (ctrl) => {
        const current = ctrl.getState().playbackRate;
        const next = Math.max(0.25, Math.round((current - 0.1) * 10) / 10);
        ctrl.setPlaybackRate(next);
      },
    });
    this.register({
      key: ']',
      code: 'BracketRight',
      description: 'Increase Speed by 0.1x',
      action: (ctrl) => {
        const current = ctrl.getState().playbackRate;
        const next = Math.min(4.0, Math.round((current + 0.1) * 10) / 10);
        ctrl.setPlaybackRate(next);
      },
    });
    this.register({
      key: 'Backspace',
      code: 'Backspace',
      description: 'Reset Speed to 1.0x',
      action: (ctrl) => ctrl.setPlaybackRate(1.0),
    });

    // Percentage seek (0-9)
    for (let i = 0; i <= 9; i++) {
      this.register({
        key: `${i}`,
        code: `Digit${i}`,
        description: `Seek to ${i * 10}%`,
        action: (ctrl) => {
          const duration = ctrl.getState().duration;
          if (duration > 0) {
            ctrl.seek((duration * i) / 10);
          }
        },
      });
    }

    // Frame stepping
    this.register({
      key: ',',
      code: 'Comma',
      description: 'Step 1 frame backward',
      action: (ctrl) => ctrl.stepFrame(false),
    });
    this.register({
      key: '.',
      code: 'Period',
      description: 'Step 1 frame forward',
      action: (ctrl) => ctrl.stepFrame(true),
    });

    // Subtitle track cycle
    this.register({
      key: 's',
      code: 'KeyS',
      description: 'Cycle Subtitle Tracks',
      action: (ctrl) => {
        const state = ctrl.getState();
        const tracks = state.subtitleTracks;
        if (tracks.length === 0) return;
        const currentId = state.selectedSubtitleTrackId;
        if (!currentId) {
          ctrl.setSubtitleTrack(tracks[0].id);
        } else {
          const idx = tracks.findIndex((t) => t.id === currentId);
          if (idx === -1 || idx === tracks.length - 1) {
            ctrl.setSubtitleTrack(null); // Turn off
          } else {
            ctrl.setSubtitleTrack(tracks[idx + 1].id);
          }
        }
      },
    });

    // Subtitle offset adjustment (z: -50ms, x: +50ms)
    this.register({
      key: 'z',
      code: 'KeyZ',
      description: 'Subtitle Delay -50ms',
      action: (ctrl) => {
        const current = ctrl.getState().subtitleOffset;
        ctrl.setSubtitleOffset(Math.round((current - 0.05) * 1000) / 1000);
      },
    });
    this.register({
      key: 'x',
      code: 'KeyX',
      description: 'Subtitle Delay +50ms',
      action: (ctrl) => {
        const current = ctrl.getState().subtitleOffset;
        ctrl.setSubtitleOffset(Math.round((current + 0.05) * 1000) / 1000);
      },
    });

    // Audio track cycle
    this.register({
      key: 'a',
      code: 'KeyA',
      description: 'Cycle Audio Tracks',
      action: (ctrl) => {
        const state = ctrl.getState();
        const tracks = state.audioTracks;
        if (tracks.length <= 1) return;
        const currentId = state.selectedAudioTrackId;
        const idx = tracks.findIndex((t) => t.id === currentId);
        const nextIdx = idx === -1 || idx === tracks.length - 1 ? 0 : idx + 1;
        ctrl.setAudioTrack(tracks[nextIdx].id);
      },
    });

    // Aspect ratio cycle
    this.register({
      key: 'c',
      code: 'KeyC',
      description: 'Cycle Aspect Ratio',
      action: (ctrl) => {
        const ratios: AspectRatio[] = ['contain', 'cover', '16:9', '4:3', '21:9', 'fill'];
        const current = ctrl.getState().aspectRatio;
        const idx = ratios.indexOf(current);
        const next = ratios[(idx + 1) % ratios.length];
        ctrl.setAspectRatio(next);
      },
    });

    // Queue Navigation: Next (N), Prev (P)
    this.register({
      key: 'n',
      code: 'KeyN',
      description: 'Next in Queue',
      action: (ctrl) => ctrl.next(),
    });
    this.register({
      key: 'p',
      code: 'KeyP',
      shift: true,
      description: 'Previous in Queue',
      action: (ctrl) => ctrl.previous(),
    });

    // Repeat Mode cycle (r)
    this.register({
      key: 'r',
      code: 'KeyR',
      description: 'Cycle Repeat Mode',
      action: (ctrl) => {
        const modes: RepeatMode[] = ['off', 'all', 'one'];
        const current = ctrl.getState().repeatMode;
        const idx = modes.indexOf(current);
        ctrl.setRepeatMode(modes[(idx + 1) % modes.length]);
      },
    });

    // Shuffle toggle (u)
    this.register({
      key: 'u',
      code: 'KeyU',
      description: 'Toggle Shuffle',
      action: (ctrl) => {
        ctrl.setShuffle(!ctrl.getState().shuffle);
      },
    });

    // Library Drawer toggle (Tab / d)
    this.register({
      key: 'Tab',
      code: 'Tab',
      description: 'Toggle Library Drawer',
      action: () => this.onCustomAction?.('toggleDrawer'),
    });
    this.register({
      key: 'd',
      code: 'KeyD',
      description: 'Toggle Library Drawer',
      action: () => this.onCustomAction?.('toggleDrawer'),
    });

    // Picture-in-Picture toggle (p)
    this.register({
      key: 'p',
      code: 'KeyP',
      description: 'Toggle Picture-in-Picture',
      action: () => this.onCustomAction?.('togglePiP'),
    });
  }
}
