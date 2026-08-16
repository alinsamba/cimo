export interface SnapshotResult {
  success: boolean;
  dataUrl?: string;
  blob?: Blob;
  filename?: string;
  width?: number;
  height?: number;
  error?: string;
}

export async function captureVideoSnapshot(
  video: HTMLVideoElement,
  customTitle?: string
): Promise<SnapshotResult> {
  if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
    return { success: false, error: 'No video frame available to capture' };
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { success: false, error: 'Failed to create 2D canvas context' };
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/png');
    const timestamp = Math.floor(video.currentTime);
    const cleanTitle = (customTitle || 'cimo_snapshot').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${cleanTitle}_${timestamp}s.png`;

    // Download snapshot image directly in browser environment
    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    return {
      success: true,
      dataUrl,
      filename,
      width: canvas.width,
      height: canvas.height,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
