import { describe, expect, it } from 'bun:test';
import { MediaController } from '../src/core/controller';
import type { MediaItem } from '../src/core/types';

describe('MediaController', () => {
  it('initializes with expected default state', () => {
    const ctrl = new MediaController();
    const state = ctrl.getState();

    expect(state.status).toBe('idle');
    expect(state.currentTime).toBe(0);
    expect(state.duration).toBe(0);
    expect(state.volume).toBe(1.0);
    expect(state.muted).toBe(false);
    expect(state.playbackRate).toBe(1.0);
    expect(state.aspectRatio).toBe('contain');
    expect(state.currentMedia).toBeNull();
    expect(state.queue).toEqual([]);
    expect(state.repeatMode).toBe('off');
    expect(state.shuffle).toBe(false);
  });

  it('loads media item and updates queue', async () => {
    const ctrl = new MediaController();
    const item: MediaItem = {
      id: 'item1',
      uri: 'https://example.com/video.mp4',
      title: 'Test Video',
      duration: 120,
      addedAt: Date.now(),
    };

    await ctrl.load(item, false);
    const state = ctrl.getState();

    expect(state.currentMedia?.id).toBe('item1');
    expect(state.queue.length).toBe(1);
    expect(state.queueIndex).toBe(0);
    expect(state.duration).toBe(120);
    expect(state.status).toBe('paused');
  });

  it('manages play, pause, togglePlay, and stop transitions', async () => {
    const ctrl = new MediaController();
    await ctrl.load('https://example.com/movie.mkv', false);

    expect(ctrl.getState().status).toBe('paused');
    await ctrl.play();
    expect(ctrl.getState().status).toBe('playing');

    ctrl.pause();
    expect(ctrl.getState().status).toBe('paused');

    await ctrl.togglePlay();
    expect(ctrl.getState().status).toBe('playing');

    ctrl.stop();
    expect(ctrl.getState().status).toBe('idle');
    expect(ctrl.getState().currentTime).toBe(0);
  });

  it('handles volume and 200% volume boost clamping', () => {
    const ctrl = new MediaController();

    ctrl.setVolume(0.5);
    expect(ctrl.getState().volume).toBe(0.5);

    // Boost to 150%
    ctrl.setVolume(1.5);
    expect(ctrl.getState().volume).toBe(1.5);

    // Boost to max 200%
    ctrl.setVolume(2.0);
    expect(ctrl.getState().volume).toBe(2.0);

    // Beyond 200% clamps to 2.0
    ctrl.setVolume(3.0);
    expect(ctrl.getState().volume).toBe(2.0);

    // Below 0 clamps to 0.0
    ctrl.setVolume(-0.5);
    expect(ctrl.getState().volume).toBe(0.0);
  });

  it('handles seeking and relative seeking', async () => {
    const ctrl = new MediaController();
    await ctrl.load({
      id: 'm1',
      uri: 'test.mp4',
      title: 'Video',
      duration: 100,
      addedAt: Date.now(),
    });

    ctrl.seek(50);
    expect(ctrl.getState().currentTime).toBe(50);

    ctrl.seekRelative(10);
    expect(ctrl.getState().currentTime).toBe(60);

    ctrl.seekRelative(-25);
    expect(ctrl.getState().currentTime).toBe(35);

    // Clamps to duration bounds
    ctrl.seek(150);
    expect(ctrl.getState().currentTime).toBe(100);

    ctrl.seek(-20);
    expect(ctrl.getState().currentTime).toBe(0);
  });

  it('handles playback rates and aspect ratio', () => {
    const ctrl = new MediaController();

    ctrl.setPlaybackRate(1.5);
    expect(ctrl.getState().playbackRate).toBe(1.5);

    ctrl.setPlaybackRate(5.0); // clamped to 4.0
    expect(ctrl.getState().playbackRate).toBe(4.0);

    ctrl.setAspectRatio('16:9');
    expect(ctrl.getState().aspectRatio).toBe('16:9');

    ctrl.setAspectRatio('21:9');
    expect(ctrl.getState().aspectRatio).toBe('21:9');
  });

  it('manages queue navigation, repeat, and shuffle', async () => {
    const ctrl = new MediaController();
    const items: MediaItem[] = [
      { id: '1', uri: '1.mp4', title: 'One', duration: 10, addedAt: 1 },
      { id: '2', uri: '2.mp4', title: 'Two', duration: 10, addedAt: 2 },
      { id: '3', uri: '3.mp4', title: 'Three', duration: 10, addedAt: 3 },
    ];

    ctrl.setQueue(items, 0);
    expect(ctrl.getState().queue.length).toBe(3);
    expect(ctrl.getState().queueIndex).toBe(0);
    expect(ctrl.getState().currentMedia?.title).toBe('One');

    await ctrl.next();
    expect(ctrl.getState().queueIndex).toBe(1);
    expect(ctrl.getState().currentMedia?.title).toBe('Two');

    await ctrl.next();
    expect(ctrl.getState().queueIndex).toBe(2);
    expect(ctrl.getState().currentMedia?.title).toBe('Three');

    // End of queue with repeat off
    await ctrl.next();
    expect(ctrl.getState().status).toBe('ended');

    // Repeat all mode
    ctrl.setRepeatMode('all');
    await ctrl.next();
    expect(ctrl.getState().queueIndex).toBe(0);
    expect(ctrl.getState().currentMedia?.title).toBe('One');

    // Shuffle
    ctrl.setShuffle(true);
    expect(ctrl.getState().shuffle).toBe(true);
    expect(ctrl.getState().queue.length).toBe(3);
  });

  it('emits events on state changes', async () => {
    const ctrl = new MediaController();
    let statusEmitted = '';
    let volumeEmitted = 0;

    ctrl.on('statuschange', (st) => {
      statusEmitted = st;
    });
    ctrl.on('volumechange', (v) => {
      volumeEmitted = v.volume;
    });

    await ctrl.load('media.mp4', true);
    expect(statusEmitted).toBe('playing');

    ctrl.setVolume(1.8);
    expect(volumeEmitted).toBe(1.8);
  });
});
