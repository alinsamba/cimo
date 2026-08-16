import type { SubtitleCue, SubtitleTrack } from '../../core/types';

export interface SubtitleRendererConfig {
  container?: HTMLElement;
  defaultFontSize?: string;
  defaultFontFamily?: string;
  defaultColor?: string;
  backgroundColor?: string;
  offsetSeconds?: number;
}

export class SubtitleRenderer {
  private activeTrack: SubtitleTrack | null = null;
  private offsetSeconds: number = 0;
  private container: HTMLElement | null = null;
  private defaultFontSize: string = '24px';
  private defaultFontFamily: string = 'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
  private defaultColor: string = '#FFFFFF';
  private backgroundColor: string = 'rgba(0, 0, 0, 0.4)';

  constructor(config?: SubtitleRendererConfig) {
    if (config?.container) {
      this.mount(config.container);
    }
    if (config?.defaultFontSize) {
      this.defaultFontSize = config.defaultFontSize;
    }
    if (config?.defaultFontFamily) {
      this.defaultFontFamily = config.defaultFontFamily;
    }
    if (config?.defaultColor) {
      this.defaultColor = config.defaultColor;
    }
    if (config?.backgroundColor) {
      this.backgroundColor = config.backgroundColor;
    }
    if (config?.offsetSeconds !== undefined) {
      this.offsetSeconds = config.offsetSeconds;
    }
  }

  /**
   * Mounts the renderer overlay inside a host DOM container.
   */
  public mount(container: HTMLElement): void {
    this.container = container;
    this.ensureOverlayElement();
  }

  /**
   * Unmounts the renderer overlay.
   */
  public unmount(): void {
    if (this.container) {
      const existing = this.container.querySelector('.cimo-subtitles-layer');
      if (existing) {
        existing.remove();
      }
      this.container = null;
    }
  }

  /**
   * Sets the active subtitle track.
   */
  public setTrack(track: SubtitleTrack | null): void {
    this.activeTrack = track;
  }

  /**
   * Gets the active subtitle track.
   */
  public getTrack(): SubtitleTrack | null {
    return this.activeTrack;
  }

  /**
   * Sets the subtitle synchronization offset in seconds.
   * Positive offset delays subtitles; negative advances them.
   */
  public setOffset(offsetSeconds: number): void {
    this.offsetSeconds = offsetSeconds;
  }

  /**
   * Gets the current subtitle offset in seconds.
   */
  public getOffset(): number {
    return this.offsetSeconds;
  }

  /**
   * Retrieves all cues active at the specified playback time with optional offset applied.
   *
   * @param track Subtitle track containing cues.
   * @param currentTime Current playback time in seconds.
   * @param offsetSeconds Optional offset in seconds (defaults to 0).
   * @returns Array of active SubtitleCue objects.
   */
  public static getActiveCues(
    track: SubtitleTrack,
    currentTime: number,
    offsetSeconds: number = 0
  ): SubtitleCue[] {
    if (!track || !track.cues || track.cues.length === 0) {
      return [];
    }

    const effectiveTime = currentTime - offsetSeconds;
    const cues = track.cues;
    const active: SubtitleCue[] = [];

    // Filter active cues
    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      if (cue && cue.startTime <= effectiveTime && effectiveTime <= cue.endTime) {
        active.push(cue);
      }
    }

    return active;
  }

  /**
   * Instance wrapper for getActiveCues using currently configured track and offset.
   */
  public getActiveCues(currentTime: number, offsetSeconds?: number): SubtitleCue[] {
    if (!this.activeTrack) {
      return [];
    }
    const effectiveOffset = offsetSeconds !== undefined ? offsetSeconds : this.offsetSeconds;
    return SubtitleRenderer.getActiveCues(this.activeTrack, currentTime, effectiveOffset);
  }

  /**
   * Formats CSS properties for a given cue style.
   */
  public formatCueStyle(cue: SubtitleCue): Record<string, string> {
    const style = cue.style ?? {};
    const alignment = style.alignment ?? 'bot-center';

    const css: Record<string, string> = {
      position: 'absolute',
      'pointer-events': 'none',
      'user-select': 'none',
      'line-height': '1.4',
      'max-width': '90%',
      'white-space': 'pre-wrap',
      'word-break': 'break-word',
      'font-family': style.fontFamily ?? this.defaultFontFamily,
      'font-size': style.fontSize ?? this.defaultFontSize,
      color: style.color ?? this.defaultColor,
      'text-shadow': '0 0 4px #000, 0 0 2px #000, 1px 1px 2px #000, -1px -1px 2px #000, 1px -1px 2px #000, -1px 1px 2px #000',
    };

    if (style.bold) css['font-weight'] = 'bold';
    if (style.italic) css['font-style'] = 'italic';
    if (style.underline) css['text-decoration'] = 'underline';

    const marginV = style.marginV !== undefined ? `${style.marginV}px` : '24px';
    const marginH = style.marginH !== undefined ? `${style.marginH}px` : '24px';

    switch (alignment) {
      case 'top-left':
        css.top = marginV;
        css.left = marginH;
        css['text-align'] = 'left';
        break;
      case 'top-center':
        css.top = marginV;
        css.left = '50%';
        css.transform = 'translateX(-50%)';
        css['text-align'] = 'center';
        break;
      case 'top-right':
        css.top = marginV;
        css.right = marginH;
        css['text-align'] = 'right';
        break;
      case 'mid-left':
        css.top = '50%';
        css.left = marginH;
        css.transform = 'translateY(-50%)';
        css['text-align'] = 'left';
        break;
      case 'mid-center':
        css.top = '50%';
        css.left = '50%';
        css.transform = 'translate(-50%, -50%)';
        css['text-align'] = 'center';
        break;
      case 'mid-right':
        css.top = '50%';
        css.right = marginH;
        css.transform = 'translateY(-50%)';
        css['text-align'] = 'right';
        break;
      case 'bot-left':
        css.bottom = marginV;
        css.left = marginH;
        css['text-align'] = 'left';
        break;
      case 'bot-right':
        css.bottom = marginV;
        css.right = marginH;
        css['text-align'] = 'right';
        break;
      case 'bot-center':
      default:
        css.bottom = marginV;
        css.left = '50%';
        css.transform = 'translateX(-50%)';
        css['text-align'] = 'center';
        break;
    }

    return css;
  }

  /**
   * Generates inline style string from CSS properties dictionary.
   */
  public formatCueCSS(cue: SubtitleCue): string {
    const styleObj = this.formatCueStyle(cue);
    return Object.entries(styleObj)
      .map(([k, v]) => `${k}: ${v};`)
      .join(' ');
  }

  /**
   * Renders active cues as an HTML string for overlay display.
   */
  public renderOverlay(cues: SubtitleCue[]): string {
    if (!cues || cues.length === 0) {
      return '<div class="cimo-subtitles-layer" style="position: absolute; inset: 0; pointer-events: none; overflow: hidden;"></div>';
    }

    const cueElements = cues.map((cue, idx) => {
      const inlineStyle = this.formatCueCSS(cue);
      const cueId = cue.id ? ` id="cimo-cue-${cue.id}"` : '';
      return `<div class="cimo-subtitle-cue"${cueId} data-index="${idx}" style="${inlineStyle}"><span class="cimo-subtitle-text">${cue.text}</span></div>`;
    });

    return `<div class="cimo-subtitles-layer" style="position: absolute; inset: 0; pointer-events: none; overflow: hidden;">\n  ${cueElements.join('\n  ')}\n</div>`;
  }

  /**
   * Updates the DOM overlay if mounted with the active cues at current playback time.
   */
  public update(currentTime: number): void {
    if (!this.container) return;

    const activeCues = this.getActiveCues(currentTime);
    const layer = this.ensureOverlayElement();
    if (layer) {
      layer.innerHTML = activeCues
        .map((cue, idx) => {
          const inlineStyle = this.formatCueCSS(cue);
          const cueId = cue.id ? ` id="cimo-cue-${cue.id}"` : '';
          return `<div class="cimo-subtitle-cue"${cueId} data-index="${idx}" style="${inlineStyle}"><span class="cimo-subtitle-text">${cue.text}</span></div>`;
        })
        .join('');
    }
  }

  /**
   * Returns base CSS for the subtitle overlay.
   */
  public getBaseCSS(): string {
    return `
.cimo-subtitles-layer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 20;
}
.cimo-subtitle-cue {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  background: ${this.backgroundColor};
  box-sizing: border-box;
}
.cimo-subtitle-cue .vtt-speaker {
  font-weight: bold;
  opacity: 0.9;
  margin-right: 4px;
}
`;
  }

  private ensureOverlayElement(): HTMLElement | null {
    if (!this.container) return null;

    let layer = this.container.querySelector<HTMLElement>('.cimo-subtitles-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'cimo-subtitles-layer';
      layer.style.position = 'absolute';
      layer.style.inset = '0';
      layer.style.pointerEvents = 'none';
      layer.style.overflow = 'hidden';
      this.container.appendChild(layer);
    }

    return layer;
  }
}
