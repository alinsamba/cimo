export interface ResumeDecision {
  shouldResume: boolean;
  resumePosition: number;
  isCompleted: boolean;
  percentage: number;
}

export interface PlaybackResumeState {
  fileHash: string;
  positionMs: number;
  durationMs: number;
  audioTrackId?: string;
  subtitleTrackId?: string;
  volume?: number;
  completed: boolean;
  updatedAt: number;
}

export const RESUME_THRESHOLDS = {
  START_THRESHOLD_RATIO: 0.03, // 3%
  END_THRESHOLD_RATIO: 0.92,   // 92%
  SAVE_INTERVAL_MS: 5000,      // 5 seconds
  MAX_LRU_ENTRIES: 1000,       // Max cached resume items
} as const;

export function evaluateResumeDecision(
  positionSeconds: number,
  durationSeconds: number
): ResumeDecision {
  if (!durationSeconds || durationSeconds <= 0 || isNaN(positionSeconds) || positionSeconds <= 0) {
    return {
      shouldResume: false,
      resumePosition: 0,
      isCompleted: false,
      percentage: 0,
    };
  }

  const ratio = positionSeconds / durationSeconds;
  const percentage = Math.round(ratio * 100);

  // 1. Opening credits / intro: 0% to 3%
  if (ratio < RESUME_THRESHOLDS.START_THRESHOLD_RATIO) {
    return {
      shouldResume: false,
      resumePosition: 0,
      isCompleted: false,
      percentage,
    };
  }

  // 2. Ending / credits: 92% to 100%
  if (ratio >= RESUME_THRESHOLDS.END_THRESHOLD_RATIO) {
    return {
      shouldResume: false,
      resumePosition: 0,
      isCompleted: true,
      percentage,
    };
  }

  // 3. Active watch window: 3% to 92%
  return {
    shouldResume: true,
    resumePosition: positionSeconds,
    isCompleted: false,
    percentage,
  };
}

export class SmartResumeTracker {
  private fileHash: string | null = null;
  private duration: number = 0;
  private currentPosition: number = 0;
  private isPlaying: boolean = false;
  private saveTimer: number | null = null;
  private onPersistState?: (state: PlaybackResumeState) => void | Promise<void>;

  constructor(onPersistState?: (state: PlaybackResumeState) => void | Promise<void>) {
    this.onPersistState = onPersistState;
  }

  public setMedia(fileHash: string, duration: number): void {
    this.flush();
    this.fileHash = fileHash;
    this.duration = duration;
    this.currentPosition = 0;
    this.isPlaying = false;
  }

  public updatePlayback(position: number, isPlaying: boolean, duration?: number): void {
    this.currentPosition = position;
    this.isPlaying = isPlaying;
    if (typeof duration === 'number' && duration > 0) {
      this.duration = duration;
    }

    if (isPlaying && !this.saveTimer && typeof setInterval !== 'undefined') {
      this.saveTimer = setInterval(() => {
        this.persistCurrentState();
      }, RESUME_THRESHOLDS.SAVE_INTERVAL_MS) as unknown as number;
    } else if (!isPlaying && this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
      this.persistCurrentState();
    }
  }

  public onPauseOrExit(audioTrackId?: string, subtitleTrackId?: string, volume?: number): void {
    this.persistCurrentState(audioTrackId, subtitleTrackId, volume);
  }

  public flush(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    this.persistCurrentState();
  }

  private persistCurrentState(audioTrackId?: string, subtitleTrackId?: string, volume?: number): void {
    if (!this.fileHash || !this.onPersistState) return;

    const decision = evaluateResumeDecision(this.currentPosition, this.duration);
    const state: PlaybackResumeState = {
      fileHash: this.fileHash,
      positionMs: Math.round(decision.resumePosition * 1000),
      durationMs: Math.round(this.duration * 1000),
      audioTrackId,
      subtitleTrackId,
      volume,
      completed: decision.isCompleted,
      updatedAt: Date.now(),
    };

    try {
      this.onPersistState(state);
    } catch (e) {
      console.warn('Failed to persist playback resume state:', e);
    }
  }
}
