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

  it('triggers short seek (±5s) on arrow keys and medium seek (±30s) with Shift', async () => {
    const ctrl = new MediaController();
    await ctrl.load({
      id: 'm1',
      uri: 'test.mp4',
      title: 'Video',
      duration: 200,
      addedAt: 1,
    });
    ctrl.seek(50);

    const shortcuts = new ShortcutEngine(ctrl);

    // Short Seek: ArrowRight (+5s)
    shortcuts.handleKeyDown({ key: 'ArrowRight', code: 'ArrowRight' });
    expect(ctrl.getState().currentTime).toBe(55);

    // Short Seek: ArrowLeft (-5s)
    shortcuts.handleKeyDown({ key: 'ArrowLeft', code: 'ArrowLeft' });
    expect(ctrl.getState().currentTime).toBe(50);

    // Medium Seek: Shift + ArrowRight (+30s)
    shortcuts.handleKeyDown({ key: 'ArrowRight', code: 'ArrowRight', shiftKey: true });
    expect(ctrl.getState().currentTime).toBe(80);

    // Medium Seek: Shift + ArrowLeft (-30s)
    shortcuts.handleKeyDown({ key: 'ArrowLeft', code: 'ArrowLeft', shiftKey: true });
    expect(ctrl.getState().currentTime).toBe(50);
  });

  it('triggers speed steps with < and >', () => {
    const ctrl = new MediaController();
    ctrl.setPlaybackRate(1.0);
    const shortcuts = new ShortcutEngine(ctrl);

    // Increase speed (>) -> 1.25x
    shortcuts.handleKeyDown({ key: '>', code: 'Period', shiftKey: true });
    expect(ctrl.getState().playbackRate).toBe(1.25);

    // Increase speed (>) -> 1.5x
    shortcuts.handleKeyDown({ key: '>', code: 'Period', shiftKey: true });
    expect(ctrl.getState().playbackRate).toBe(1.5);

    // Decrease speed (<) -> 1.25x
    shortcuts.handleKeyDown({ key: '<', code: 'Comma', shiftKey: true });
    expect(ctrl.getState().playbackRate).toBe(1.25);
  });

  it('cycles audio tracks on B and subtitle tracks on V', () => {
    const ctrl = new MediaController();
    ctrl.setAudioTracks([
      { id: 'a1', label: 'English 5.1' },
      { id: 'a2', label: 'French Stereo' },
    ]);
    ctrl.setSubtitleTracks([
      { id: 's1', label: 'English', format: 'srt', cues: [] },
      { id: 's2', label: 'Spanish', format: 'vtt', cues: [] },
    ]);

    const shortcuts = new ShortcutEngine(ctrl);

    // Audio cycle (B)
    shortcuts.handleKeyDown({ key: 'b', code: 'KeyB' });
    expect(ctrl.getState().selectedAudioTrackId).toBe('a2');

    shortcuts.handleKeyDown({ key: 'b', code: 'KeyB' });
    expect(ctrl.getState().selectedAudioTrackId).toBe('a1');

    // Subtitle cycle (V)
    shortcuts.handleKeyDown({ key: 'v', code: 'KeyV' });
    expect(ctrl.getState().selectedSubtitleTrackId).toBe('s1');

    shortcuts.handleKeyDown({ key: 'v', code: 'KeyV' });
    expect(ctrl.getState().selectedSubtitleTrackId).toBe('s2');

    shortcuts.handleKeyDown({ key: 'v', code: 'KeyV' });
    expect(ctrl.getState().selectedSubtitleTrackId).toBeNull(); // Off
  });

  it('handles custom rebinding, reserved OS validation, and collision detection', () => {
    const ctrl = new MediaController();
    const shortcuts = new ShortcutEngine(ctrl);

    // Rebind successfully to unused key (y)
    const res1 = shortcuts.rebind('play_pause_space', 'y');
    expect(res1.success).toBe(true);

    // Press new key (y)
    shortcuts.handleKeyDown({ key: 'y', code: 'KeyY' });
    expect(ctrl.getState().status).toBe('playing');

    // Reject reserved OS shortcut (Ctrl+W)
    const resReserved = shortcuts.rebind('play_pause_space', 'w', { ctrl: true });
    expect(resReserved.success).toBe(false);
    expect(resReserved.error).toContain('reserved by the OS');

    // Collision detection (p is already PiP toggle)
    const resCollision = shortcuts.rebind('play_pause_space', 'p');
    expect(resCollision.success).toBe(false);
    expect(resCollision.error).toContain('Collision');
  });

  it('exports and imports keymaps accurately', () => {
    const ctrl = new MediaController();
    const shortcuts = new ShortcutEngine(ctrl);

    const initialMap = shortcuts.exportKeymap();
    expect(initialMap['play_pause_k']).toBe('k');

    shortcuts.rebind('play_pause_k', 'x', { shift: true });
    expect(shortcuts.exportKeymap()['play_pause_k']).toBe('Shift+x');

    shortcuts.importKeymap({ play_pause_k: 'z' });
    expect(shortcuts.exportKeymap()['play_pause_k']).toBe('z');
  });
});
