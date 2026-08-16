export interface ToastOptions {
  durationMs?: number;
  icon?: string;
  actionText?: string;
  onAction?: () => void;
  variant?: 'default' | 'resume' | 'success' | 'warning';
}

export class ToastManager {
  private container: HTMLElement;
  private resumeToastElement: HTMLElement | null = null;
  private resumeTimeout: number | null = null;
  private shortcutToastElement: HTMLElement | null = null;
  private shortcutTimeout: number | null = null;

  constructor(containerElement?: HTMLElement) {
    if (containerElement) {
      this.container = containerElement;
    } else {
      let el = document.getElementById('toast-container');
      if (!el) {
        el = document.createElement('div');
        el.id = 'toast-container';
        el.className = 'toast-container';
        document.body.appendChild(el);
      }
      this.container = el;
    }
  }

  public show(message: string, options?: ToastOptions): void {
    const duration = options?.durationMs ?? 1500;
    const icon = options?.icon;

    if (this.shortcutTimeout !== null) {
      clearTimeout(this.shortcutTimeout);
      this.shortcutTimeout = null;
    }

    if (!this.shortcutToastElement) {
      this.shortcutToastElement = document.createElement('div');
      this.shortcutToastElement.className = 'hud-toast hud-toast-shortcut';
      this.container.appendChild(this.shortcutToastElement);
    }

    this.shortcutToastElement.innerHTML = `
      ${icon ? `<span class="toast-icon">${icon}</span>` : ''}
      <span class="toast-text">${this.escapeHtml(message)}</span>
    `;

    this.shortcutToastElement.classList.add('visible');

    this.shortcutTimeout = setTimeout(() => {
      this.shortcutToastElement?.classList.remove('visible');
    }, duration) as unknown as number;
  }

  public showResumeToast(
    timeFormatted: string,
    onRestartFromBeginning: () => void,
    durationMs: number = 4000
  ): void {
    if (this.resumeTimeout !== null) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }

    if (!this.resumeToastElement) {
      this.resumeToastElement = document.createElement('div');
      this.resumeToastElement.className = 'hud-toast hud-toast-resume';
      this.container.appendChild(this.resumeToastElement);
    }

    this.resumeToastElement.innerHTML = `
      <span class="toast-icon">⏱️</span>
      <span class="toast-text">Resumed at ${this.escapeHtml(timeFormatted)}</span>
      <span class="toast-divider">|</span>
      <button class="toast-action-btn" id="btn-resume-restart">Start from Beginning</button>
      <button class="toast-close-btn" id="btn-resume-dismiss">✕</button>
    `;

    const restartBtn = this.resumeToastElement.querySelector('#btn-resume-restart');
    restartBtn?.addEventListener('click', () => {
      onRestartFromBeginning();
      this.hideResumeToast();
    });

    const dismissBtn = this.resumeToastElement.querySelector('#btn-resume-dismiss');
    dismissBtn?.addEventListener('click', () => {
      this.hideResumeToast();
    });

    this.resumeToastElement.classList.add('visible');

    this.resumeTimeout = setTimeout(() => {
      this.hideResumeToast();
    }, durationMs) as unknown as number;
  }

  public hideResumeToast(): void {
    if (this.resumeTimeout !== null) {
      clearTimeout(this.resumeTimeout);
      this.resumeTimeout = null;
    }
    this.resumeToastElement?.classList.remove('visible');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
