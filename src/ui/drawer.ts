import type { IMediaController, MediaItem, Playlist, PlaybackHistoryItem } from '../core/types';

export interface DrawerConfig {
  drawerElement: HTMLElement;
  onOpenFiles?: () => void;
  onOpenFolder?: () => void;
  onCreatePlaylist?: (name: string) => Promise<Playlist>;
  onLoadPlaylist?: (playlistId: string) => Promise<void>;
  onDeletePlaylist?: (playlistId: string) => Promise<void>;
  onGetHistory?: () => Promise<PlaybackHistoryItem[]>;
  onGetPlaylists?: () => Promise<Playlist[]>;
  onGetAllMedia?: (search?: string) => Promise<MediaItem[]>;
}

export class LibraryDrawer {
  private controller: IMediaController;
  private drawer: HTMLElement;
  private isOpen: boolean = false;
  private currentTab: 'queue' | 'playlists' | 'history' | 'media' = 'queue';

  private onOpenFiles?: () => void;
  private onOpenFolder?: () => void;
  private onCreatePlaylist?: (name: string) => Promise<Playlist>;
  private onLoadPlaylist?: (playlistId: string) => Promise<void>;
  private onDeletePlaylist?: (playlistId: string) => Promise<void>;
  private onGetHistory?: () => Promise<PlaybackHistoryItem[]>;
  private onGetPlaylists?: () => Promise<Playlist[]>;
  private onGetAllMedia?: (search?: string) => Promise<MediaItem[]>;

  private elements: {
    closeBtn?: HTMLButtonElement;
    searchInput?: HTMLInputElement;
    tabs?: NodeListOf<HTMLButtonElement>;
    contentArea?: HTMLElement;
    btnOpenFiles?: HTMLButtonElement;
    btnOpenFolder?: HTMLButtonElement;
  } = {};

  constructor(controller: IMediaController, config: DrawerConfig) {
    this.controller = controller;
    this.drawer = config.drawerElement;

    this.onOpenFiles = config.onOpenFiles;
    this.onOpenFolder = config.onOpenFolder;
    this.onCreatePlaylist = config.onCreatePlaylist;
    this.onLoadPlaylist = config.onLoadPlaylist;
    this.onDeletePlaylist = config.onDeletePlaylist;
    this.onGetHistory = config.onGetHistory;
    this.onGetPlaylists = config.onGetPlaylists;
    this.onGetAllMedia = config.onGetAllMedia;

    this.queryElements();
    this.bindEvents();
    this.bindControllerListeners();
  }

  public open(): void {
    this.isOpen = true;
    this.drawer.classList.add('open');
    this.renderCurrentTab();
  }

  public close(): void {
    this.isOpen = false;
    this.drawer.classList.remove('open');
  }

  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  public isDrawerOpen(): boolean {
    return this.isOpen;
  }

  private queryElements(): void {
    this.elements.closeBtn = this.drawer.querySelector('#btn-close-drawer') as HTMLButtonElement;
    this.elements.searchInput = this.drawer.querySelector('#drawer-search-input') as HTMLInputElement;
    this.elements.tabs = this.drawer.querySelectorAll('.drawer-tab');
    this.elements.contentArea = this.drawer.querySelector('#drawer-content-area') as HTMLElement;
    this.elements.btnOpenFiles = this.drawer.querySelector('#btn-drawer-open-files') as HTMLButtonElement;
    this.elements.btnOpenFolder = this.drawer.querySelector('#btn-drawer-open-folder') as HTMLButtonElement;
  }

  private bindEvents(): void {
    this.elements.closeBtn?.addEventListener('click', () => this.close());

    this.elements.tabs?.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.elements.tabs?.forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this.currentTab = (tab.dataset.tab as 'queue' | 'playlists' | 'history' | 'media') || 'queue';
        this.renderCurrentTab();
      });
    });

    this.elements.searchInput?.addEventListener('input', () => {
      this.renderCurrentTab();
    });

    this.elements.btnOpenFiles?.addEventListener('click', () => this.onOpenFiles?.());
    this.elements.btnOpenFolder?.addEventListener('click', () => this.onOpenFolder?.());
  }

  private bindControllerListeners(): void {
    const emitter = this.controller as unknown as {
      on: (event: string, fn: (...args: unknown[]) => void) => void;
    };

    if (typeof emitter.on === 'function') {
      emitter.on('queuechange', () => {
        if (this.isOpen && this.currentTab === 'queue') {
          this.renderQueue();
        }
      });

      emitter.on('mediachange', () => {
        if (this.isOpen && this.currentTab === 'queue') {
          this.renderQueue();
        }
      });
    }
  }

  public async renderCurrentTab(): Promise<void> {
    if (!this.elements.contentArea) return;

    switch (this.currentTab) {
      case 'queue':
        this.renderQueue();
        break;
      case 'playlists':
        await this.renderPlaylists();
        break;
      case 'history':
        await this.renderHistory();
        break;
      case 'media':
        await this.renderMediaLibrary();
        break;
    }
  }

  private renderQueue(): void {
    const content = this.elements.contentArea;
    if (!content) return;

    const state = this.controller.getState();
    const queue = state.queue;
    const currentIndex = state.queueIndex;
    const searchTerm = this.elements.searchInput?.value.toLowerCase() || '';

    if (queue.length === 0) {
      content.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">🎵</div>
          <div>Playback Queue is empty</div>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">Drop media files anywhere to play</div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.5rem;">
        <span style="font-size: 0.8rem; color: var(--text-secondary);">${queue.length} item${queue.length === 1 ? '' : 's'}</span>
        <button id="btn-clear-queue" class="btn-icon" title="Clear Queue" style="font-size: 0.75rem; width: auto; padding: 0 0.5rem;">Clear All</button>
      </div>
      <div class="queue-items-container">
    `;

    queue.forEach((item, index) => {
      if (searchTerm && !item.title.toLowerCase().includes(searchTerm)) {
        return;
      }
      const isActive = index === currentIndex;
      html += `
        <div class="media-list-item ${isActive ? 'active' : ''}" data-queue-index="${index}">
          <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden;">
            <span style="font-family: var(--font-mono); font-size: 0.75rem; color: ${isActive ? 'var(--accent)' : 'var(--text-muted)'}; width: 20px;">
              ${isActive ? '▶' : index + 1}
            </span>
            <div class="media-item-info">
              <span class="media-item-title">${this.escapeHtml(item.title)}</span>
              <span class="media-item-subtitle">${item.artist || item.metadata?.format?.toUpperCase() || 'Local File'}</span>
            </div>
          </div>
          <button class="btn-icon btn-remove-queue-item" data-remove-index="${index}" title="Remove">✕</button>
        </div>
      `;
    });

    html += `</div>`;
    content.innerHTML = html;

    // Attach click events
    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-remove-queue-item')) return;
        const indexStr = (el as HTMLElement).dataset.queueIndex;
        if (indexStr) {
          const idx = parseInt(indexStr, 10);
          this.controller.setQueue(this.controller.getState().queue, idx);
        }
      });
    });

    content.querySelectorAll('.btn-remove-queue-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const indexStr = (btn as HTMLElement).dataset.removeIndex;
        if (indexStr) {
          this.controller.removeFromQueue(parseInt(indexStr, 10));
        }
      });
    });

    content.querySelector('#btn-clear-queue')?.addEventListener('click', () => {
      this.controller.setQueue([]);
    });
  }

  private async renderPlaylists(): Promise<void> {
    const content = this.elements.contentArea;
    if (!content) return;

    content.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Loading playlists...</div>`;

    const playlists = this.onGetPlaylists ? await this.onGetPlaylists() : [];

    let html = `
      <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <span style="font-size: 0.8rem; color: var(--text-secondary);">${playlists.length} playlist${playlists.length === 1 ? '' : 's'}</span>
        <button id="btn-create-playlist-ui" class="btn-icon" style="width: auto; padding: 0 0.5rem; font-size: 0.75rem;">+ New Playlist</button>
      </div>
    `;

    if (playlists.length === 0) {
      html += `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <div>No playlists yet</div>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">Create a playlist to organize your media</div>
        </div>
      `;
    } else {
      playlists.forEach((p) => {
        html += `
          <div class="media-list-item" data-playlist-id="${p.id}">
            <div class="media-item-info">
              <span class="media-item-title">📁 ${this.escapeHtml(p.name)}</span>
              <span class="media-item-subtitle">${p.itemCount} items</span>
            </div>
            <button class="btn-icon btn-delete-playlist" data-playlist-id="${p.id}" title="Delete">🗑️</button>
          </div>
        `;
      });
    }

    content.innerHTML = html;

    content.querySelector('#btn-create-playlist-ui')?.addEventListener('click', async () => {
      const name = prompt('Enter playlist name:');
      if (name && this.onCreatePlaylist) {
        await this.onCreatePlaylist(name.trim());
        await this.renderPlaylists();
      }
    });

    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', async (e) => {
        if ((e.target as HTMLElement).closest('.btn-delete-playlist')) return;
        const id = (el as HTMLElement).dataset.playlistId;
        if (id && this.onLoadPlaylist) {
          await this.onLoadPlaylist(id);
        }
      });
    });

    content.querySelectorAll('.btn-delete-playlist').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.playlistId;
        if (id && this.onDeletePlaylist && confirm('Delete this playlist?')) {
          await this.onDeletePlaylist(id);
          await this.renderPlaylists();
        }
      });
    });
  }

  private async renderHistory(): Promise<void> {
    const content = this.elements.contentArea;
    if (!content) return;

    content.innerHTML = `<div style="padding: 1rem; text-align: center; color: var(--text-muted);">Loading history...</div>`;

    const history = this.onGetHistory ? await this.onGetHistory() : [];

    if (history.length === 0) {
      content.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <div>No playback history</div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.5rem;">
        <span style="font-size: 0.8rem; color: var(--text-secondary);">Recently Played</span>
      </div>
    `;

    history.forEach((h) => {
      const pct = h.duration > 0 ? Math.min(100, (h.position / h.duration) * 100) : 0;
      html += `
        <div class="media-list-item" data-history-uri="${this.escapeHtml(h.uri)}" data-history-pos="${h.position}">
          <div class="media-item-info" style="width: 100%;">
            <span class="media-item-title">${this.escapeHtml(h.title)}</span>
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
              <span>${h.completed ? 'Completed' : `Resume at ${Math.round(pct)}%`}</span>
              <span>${new Date(h.lastPlayedAt).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;

    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', () => {
        const uri = (el as HTMLElement).dataset.historyUri;
        const pos = parseFloat((el as HTMLElement).dataset.historyPos || '0');
        if (uri) {
          this.controller.load(uri, true).then(() => {
            if (pos > 0) {
              this.controller.seek(pos);
            }
          });
        }
      });
    });
  }

  private async renderMediaLibrary(): Promise<void> {
    const content = this.elements.contentArea;
    if (!content) return;

    const searchTerm = this.elements.searchInput?.value || '';
    const items = this.onGetAllMedia ? await this.onGetAllMedia(searchTerm) : [];

    if (items.length === 0) {
      content.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
          <div>No media found</div>
          <div style="font-size: 0.8rem; margin-top: 0.25rem;">Scan a folder to populate library</div>
        </div>
      `;
      return;
    }

    let html = `
      <div style="padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border-subtle); margin-bottom: 0.5rem;">
        <span style="font-size: 0.8rem; color: var(--text-secondary);">${items.length} file${items.length === 1 ? '' : 's'}</span>
      </div>
    `;

    items.forEach((item) => {
      html += `
        <div class="media-list-item" data-media-uri="${this.escapeHtml(item.uri)}">
          <div class="media-item-info">
            <span class="media-item-title">${this.escapeHtml(item.title)}</span>
            <span class="media-item-subtitle">${item.artist || item.metadata?.resolution || 'Media File'}</span>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;

    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', () => {
        const uri = (el as HTMLElement).dataset.mediaUri;
        if (uri) {
          this.controller.load(uri, true);
        }
      });
    });
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
