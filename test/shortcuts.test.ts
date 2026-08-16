import { describe, expect, it } from 'bun:test';
import { MediaController } from '../src/core/controller';
import { ShortcutEngine } from '../src/core/shortcuts';

describe('ShortcutEngine', () => {
  it('triggers play/pause on Space and K', () => {
    const ctrl = new MediaController();
    const shortcuts = new ShortcutEngine(ctrl);

    expect(ctrl.getState().status).toBe('idle');

    // Press Space
    const handledSpace = shortcuts.handleKeyDown({ key: ' ', code: 'Space' });
    expect(handledSpace).toBe(true);
    expect(ctrl.getState().status).toBe('playing');

    // Press K
    const handledK = shortcuts.handleKeyDown({ key: 'k', code: 'KeyK' });
    expect(handledK).toBe(true);
    expect(ctrl.getState().status).toBe('paused');
  });

  it('triggers seeking on arrow keys and J/L', async () => {
    const ctrl = new MediaController();
    await ctrl.load({
      id: 'm1',
      uri: 'test.mp4',
      title: 'Video',
      duration: 100,
      addedAt: 1,
    });
    ctrl.seek(20);

    const shortcuts = new ShortcutEngine(ctrl);

    // ArrowRight (+5s)
    shortcuts.handleKeyDown({ key: 'ArrowRight', code: 'ArrowRight' });
    expect(ctrl.getState().currentTime).toBe(25);

    // ArrowLeft (-5s)
    shortcuts.handleKeyDown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(ctrl.getState().currentTime).toBe(20);

    // L (+10s)
    shortcuts.handleKeyDown({ key: 'l', code: 'KeyL' });
    expect(ctrl.getState().currentTime).toBe(30);

    // J (-10s)
    shortcuts.handleKeyDown({ key: 'j', code: 'KeyJ' });
    expect(ctrl.getState().currentTime).toBe(20);
  });

  it('triggers volume changes on Up/Down arrows and Mute on M', () => {
    const ctrl = new MediaController();
    const shortcuts = new ShortcutEngine(ctrl);

    ctrl.setVolume(1.0);

    // Volume Down (-5%)
    shortcuts.handleKeyDown({ key: 'ArrowDown', code: 'ArrowDown' });
    expect(ctrl.getState().volume).toBe(0.95);

    // Volume Up (+5%)
    shortcuts.handleKeyDown({ key: 'ArrowUp', code: 'ArrowUp' });
    expect(ctrl.getState().volume).toBe(1.0);

    // Mute toggle (M)
    shortcuts.handleKeyDown({ key: 'm', code: 'KeyM' });
    expect(ctrl.getState().muted).toBe(true);

    shortcuts.handleKeyDown({ key: 'm', code: 'KeyM' });
    expect(ctrl.getState().muted).toBe(false);
  });

  it('triggers speed changes on bracket keys and reset on Backspace', () => {
    const ctrl = new MediaController();
    const shortcuts = new ShortcutEngine(ctrl);

    // Increase speed (])
    shortcuts.handleKeyDown({ key: ']', code: 'BracketRight' });
    expect(ctrl.getState().playbackRate).toBe(1.1);

    // Decrease speed ([)
    shortcuts.handleKeyDown({ key: '[', code: 'BracketLeft' });
    expect(ctrl.getState().playbackRate).toBe(1.0);

    // Reset speed (Backspace)
    ctrl.setPlaybackRate(2.5);
    shortcuts.handleKeyDown({ key: 'Backspace', code: 'Backspace' });
    expect(ctrl.getState().playbackRate).toBe(1.0);
  });

  it('triggers percentage seek on digit keys 0-9', async () => {
    const ctrl = new MediaController();
    await ctrl.load({
      id: 'm1',
      uri: 'test.mp4',
      title: 'Video',
      duration: 100,
      addedAt: 1,
    });
    const shortcuts = new ShortcutEngine(ctrl);

    shortcuts.handleKeyDown({ key: '5', code: 'Digit5' });
    expect(ctrl.getState().currentTime).toBe(50);

    shortcuts.handleKeyDown({ key: '0', code: 'Digit0' });
    expect(ctrl.getState().currentTime).toBe(0);

    shortcuts.handleKeyDown({ key: '9', code: 'Digit9' });
    expect(ctrl.getState().currentTime).toBe(90);
  });

  it('ignores shortcuts when typing in input fields', () => {
    const ctrl = new MediaController();
    const shortcuts = new ShortcutEngine(ctrl);

    const handled = shortcuts.handleKeyDown({
      key: ' ',
      code: 'Space',
      target: { tagName: 'INPUT' },
    });

    expect(handled).toBe(false);
    expect(ctrl.getState().status).toBe('idle');
  });

  it('calls custom action handler for fullscreen, drawer, escape', () => {
    const ctrl = new MediaController();
    let triggeredAction = '';
    const shortcuts = new ShortcutEngine(ctrl, (action) => {
      triggeredAction = action;
    });

    shortcuts.handleKeyDown({ key: 'f', code: 'KeyF' });
    expect(triggeredAction).toBe('toggleFullscreen');

    shortcuts.handleKeyDown({ key: 'd', code: 'KeyD' });
    expect(triggeredAction).toBe('toggleDrawer');

    shortcuts.handleKeyDown({ key: 'Escape', code: 'Escape' });
    expect(triggeredAction).toBe('escape');
  });
});
