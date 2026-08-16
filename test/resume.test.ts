import { describe, expect, it } from 'bun:test';
import { evaluateResumeDecision, SmartResumeTracker, type PlaybackResumeState } from '../src/core/resume';

describe('Smart Resume Logic', () => {
  it('handles start threshold (0% to 3%) by starting fresh from beginning', () => {
    const duration = 1000; // 1000 seconds

    // 10s into 1000s video = 1%
    const res1 = evaluateResumeDecision(10, duration);
    expect(res1.shouldResume).toBe(false);
    expect(res1.resumePosition).toBe(0);
    expect(res1.isCompleted).toBe(false);

    // 25s into 1000s video = 2.5%
    const res2 = evaluateResumeDecision(25, duration);
    expect(res2.shouldResume).toBe(false);
    expect(res2.resumePosition).toBe(0);
  });

  it('handles active window (3% to 92%) by preserving exact timestamp', () => {
    const duration = 1000;

    // 150s into 1000s video = 15%
    const res1 = evaluateResumeDecision(150, duration);
    expect(res1.shouldResume).toBe(true);
    expect(res1.resumePosition).toBe(150);
    expect(res1.isCompleted).toBe(false);
    expect(res1.percentage).toBe(15);

    // 850s into 1000s video = 85%
    const res2 = evaluateResumeDecision(850, duration);
    expect(res2.shouldResume).toBe(true);
    expect(res2.resumePosition).toBe(850);
    expect(res2.isCompleted).toBe(false);
    expect(res2.percentage).toBe(85);
  });

  it('handles ending threshold (92% to 100%) by marking completed and clearing timestamp', () => {
    const duration = 1000;

    // 950s into 1000s video = 95%
    const res1 = evaluateResumeDecision(950, duration);
    expect(res1.shouldResume).toBe(false);
    expect(res1.resumePosition).toBe(0);
    expect(res1.isCompleted).toBe(true);
    expect(res1.percentage).toBe(95);

    // 990s into 1000s video = 99%
    const res2 = evaluateResumeDecision(990, duration);
    expect(res2.shouldResume).toBe(false);
    expect(res2.isCompleted).toBe(true);
  });

  it('SmartResumeTracker persists state on pause and flush', () => {
    let savedState: PlaybackResumeState | null = null;
    const tracker = new SmartResumeTracker((state) => {
      savedState = state;
    });

    tracker.setMedia('fp_video_123', 1000);
    tracker.updatePlayback(450, true); // 45%

    // Pause triggers save
    tracker.onPauseOrExit('audio_1', 'sub_2', 1.2);

    expect(savedState).not.toBeNull();
    expect(savedState?.fileHash).toBe('fp_video_123');
    expect(savedState?.positionMs).toBe(450000);
    expect(savedState?.durationMs).toBe(1000000);
    expect(savedState?.audioTrackId).toBe('audio_1');
    expect(savedState?.subtitleTrackId).toBe('sub_2');
    expect(savedState?.volume).toBe(1.2);
    expect(savedState?.completed).toBe(false);
  });
});
