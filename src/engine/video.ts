import type { AspectRatio } from '../core/types';

export interface VideoViewportConfig {
  videoElement?: HTMLVideoElement;
  containerElement?: HTMLElement;
  aspectRatio?: AspectRatio;
}

export class VideoEngine {
  private video: HTMLVideoElement | null = null;
  private container: HTMLElement | null = null;
  private currentAspectRatio: AspectRatio = 'contain';
  private frameRate: number = 30; // default estimated fps for frame stepping

  constructor(config?: VideoViewportConfig) {
    if (config?.videoElement) {
      this.attach(config.videoElement, config.containerElement);
    }
    if (config?.aspectRatio) {
      this.setAspectRatio(config.aspectRatio);
    }
  }

  public attach(video: HTMLVideoElement, container?: HTMLElement): void {
    this.video = video;
    this.container = container || video.parentElement;

    // Apply hardware acceleration and high-performance video attributes
    this.video.playsInline = true;
    this.video.crossOrigin = 'anonymous';
    this.video.preload = 'auto';

    this.applyAspectRatioStyles();
  }

  public detach(): void {
    this.video = null;
    this.container = null;
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }

  public setAspectRatio(ratio: AspectRatio): void {
    this.currentAspectRatio = ratio;
    this.applyAspectRatioStyles();
  }

  public getAspectRatio(): AspectRatio {
    return this.currentAspectRatio;
  }

  public calculateDimensions(videoWidth: number, videoHeight: number, containerWidth: number, containerHeight: number, ratio: AspectRatio): { width: number; height: number; objectFit: string; transform?: string } {
    if (videoWidth <= 0 || videoHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
      return { width: containerWidth, height: containerHeight, objectFit: 'contain' };
    }

    switch (ratio) {
      case 'contain':
        return { width: containerWidth, height: containerHeight, objectFit: 'contain' };
      case 'cover':
        return { width: containerWidth, height: containerHeight, objectFit: 'cover' };
      case 'fill':
        return { width: containerWidth, height: containerHeight, objectFit: 'fill' };
      case '16:9': {
        const targetRatio = 16 / 9;
        const currentContainerRatio = containerWidth / containerHeight;
        let w = containerWidth;
        let h = containerHeight;
        if (currentContainerRatio > targetRatio) {
          w = containerHeight * targetRatio;
        } else {
          h = containerWidth / targetRatio;
        }
        return { width: w, height: h, objectFit: 'fill' };
      }
      case '4:3': {
        const targetRatio = 4 / 3;
        const currentContainerRatio = containerWidth / containerHeight;
        let w = containerWidth;
        let h = containerHeight;
        if (currentContainerRatio > targetRatio) {
          w = containerHeight * targetRatio;
        } else {
          h = containerWidth / targetRatio;
        }
        return { width: w, height: h, objectFit: 'fill' };
      }
      case '21:9': {
        const targetRatio = 21 / 9;
        const currentContainerRatio = containerWidth / containerHeight;
        let w = containerWidth;
        let h = containerHeight;
        if (currentContainerRatio > targetRatio) {
          w = containerHeight * targetRatio;
        } else {
          h = containerWidth / targetRatio;
        }
        return { width: w, height: h, objectFit: 'fill' };
      }
      case 'original':
        return { width: videoWidth, height: videoHeight, objectFit: 'none' };
      default:
        return { width: containerWidth, height: containerHeight, objectFit: 'contain' };
    }
  }

  public stepFrame(forward: boolean = true): void {
    if (!this.video) return;

    // Pause first if currently playing
    if (!this.video.paused) {
      this.video.pause();
    }

    const frameDuration = 1.0 / this.frameRate;
    const targetTime = forward
      ? Math.min(this.video.duration || Infinity, this.video.currentTime + frameDuration)
      : Math.max(0, this.video.currentTime - frameDuration);

    this.video.currentTime = targetTime;
  }

  public async togglePictureInPicture(): Promise<boolean> {
    if (!this.video) return false;

    try {
      const doc = typeof document !== 'undefined' ? document : null;
      if (!doc) return false;

      const pipDoc = doc as unknown as { pictureInPictureElement?: Element; exitPictureInPicture?: () => Promise<void> };

      if (pipDoc.pictureInPictureElement) {
        await pipDoc.exitPictureInPicture?.();
        return false;
      } else {
        const pipVideo = this.video as unknown as { requestPictureInPicture?: () => Promise<unknown> };
        if (pipVideo.requestPictureInPicture) {
          await pipVideo.requestPictureInPicture();
          return true;
        }
      }
    } catch (err) {
      console.warn('Picture-in-Picture error:', err);
    }
    return false;
  }

  private applyAspectRatioStyles(): void {
    if (!this.video) return;

    switch (this.currentAspectRatio) {
      case 'contain':
        this.video.style.objectFit = 'contain';
        this.video.style.width = '100%';
        this.video.style.height = '100%';
        break;
      case 'cover':
        this.video.style.objectFit = 'cover';
        this.video.style.width = '100%';
        this.video.style.height = '100%';
        break;
      case 'fill':
        this.video.style.objectFit = 'fill';
        this.video.style.width = '100%';
        this.video.style.height = '100%';
        break;
      case '16:9':
      case '4:3':
      case '21:9':
        this.video.style.objectFit = 'fill';
        this.video.style.width = '100%';
        this.video.style.height = '100%';
        break;
      case 'original':
        this.video.style.objectFit = 'none';
        this.video.style.width = 'auto';
        this.video.style.height = 'auto';
        break;
    }
  }
}
