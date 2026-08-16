import type { IMediaController, MediaItem, Playlist, PlaybackHistoryItem } from '../core/types';
import { parseMediaDisplayTitle } from '../core/title';

export interface DrawerConfig {
  drawerElement: HTMLElement;
  onOpenFiles?: () => void;
  onOpenFolder?: () => void;
  onCreatePlaylist?: (name: string) => Promise<Playlist>;
  onLoadPlaylist?: (playlistId: string) => Promise<void>;
  onDeletePlaylist?: (playlistId: string) => Promise<void>;
  onGetHistory?: () => Promise<PlaybackHistoryItem[]>;
  onClearHistory?: () => Promise<void>;
  onGetPlaylists?: () => Promise<Playlist[]>;
  onGetAllMedia?: (search?: string) => Promise<MediaItem[]>;
}

export class LibraryDrawer {
  private controller: IMediaController;
  private drawer: HTMLElement;
  private isOpen: boolean = false;
  private currentTab: 'queue' | 'playlists' | 'history' | 'media' = 'queue';
  private focusedItemIndex: number = -1;

  private onOpenFiles?: () => void;
  private onOpenFolder?: () => void;
  private onCreatePlaylist?: (name: string) => Promise<Playlist>;
  private onLoadPlaylist?: (playlistId: string) => Promise<void>;
  private onDeletePlaylist?: (playlistId: string) => Promise<void>;
  private onGetHistory?: () => Promise<PlaybackHistoryItem[]>;
  private onClearHistory?: () => Promise<void>;
  private onGetPlaylists?: () => Promise<Playlist[]>;
  private onGetAllMedia?: (search?: string) => Promise<MediaItem[]>;

  private elements: {
    closeBtn?: HTMLButtonElement;
    searchInput?: HTMLInputElement;
    clearSearchBtn?: HTMLButtonElement;
    tabs?: NodeListOf<HTMLButtonElement>;
    contentArea?: HTMLElement;
    btnOpenFiles?: HTMLButtonElement;
    btnOpenFolder?: HTMLButtonElement;
    footerDynamic?: HTMLElement;
    itemCountBadge?: HTMLElement;
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
    this.onClearHistory = config.onClearHistory;
    this.onGetPlaylists = config.onGetPlaylists;
    this.onGetAllMedia = config.onGetAllMedia;

    this.queryElements();
    this.bindEvents();
    this.bindControllerListeners();
    this.bindKeyboardNavigation();
  }

  public open(): void {
    this.isOpen = true;
    this.drawer.classList.add('open');
    this.renderCurrentTab();
    setTimeout(() => {
      this.elements.searchInput?.focus();
    }, 100);
  }

  public close(): void {
    this.isOpen = false;
    this.drawer.classList.remove('open');
    this.closeInfoModal();
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

  public setTab(tab: 'queue' | 'playlists' | 'history' | 'media'): void {
    this.currentTab = tab;
    this.elements.tabs?.forEach((t) => {
      const match = t.dataset.tab === tab;
      t.classList.toggle('active', match);
      t.setAttribute('aria-selected', match ? 'true' : 'false');
    });
    this.updateSearchPlaceholder();
    this.renderCurrentTab();
  }

  private queryElements(): void {
    this.elements.closeBtn = this.drawer.querySelector('#btn-close-drawer') as HTMLButtonElement;
    this.elements.searchInput = this.drawer.querySelector('#drawer-search-input') as HTMLInputElement;
    this.elements.clearSearchBtn = this.drawer.querySelector('#btn-clear-search') as HTMLButtonElement;
    this.elements.tabs = this.drawer.querySelectorAll('.drawer-tab');
    this.elements.contentArea = this.drawer.querySelector('#drawer-content-area') as HTMLElement;
    this.elements.btnOpenFiles = this.drawer.querySelector('#btn-drawer-open-files') as HTMLButtonElement;
    this.elements.btnOpenFolder = this.drawer.querySelector('#btn-drawer-open-folder') as HTMLButtonElement;
    this.elements.footerDynamic = this.drawer.querySelector('#drawer-footer-dynamic') as HTMLElement;
    this.elements.itemCountBadge = this.drawer.querySelector('#drawer-item-count') as HTMLElement;
  }

  private bindEvents(): void {
    this.elements.closeBtn?.addEventListener('click', () => this.close());

    this.elements.tabs?.forEach((tab) => {
      tab.addEventListener('click', () => {
        const targetTab = (tab.dataset.tab as 'queue' | 'playlists' | 'history' | 'media') || 'queue';
        this.setTab(targetTab);
      });
    });

    this.elements.searchInput?.addEventListener('input', () => {
      const hasText = !!this.elements.searchInput?.value;
      if (this.elements.clearSearchBtn) {
        this.elements.clearSearchBtn.style.display = hasText ? 'block' : 'none';
      }
      this.renderCurrentTab();
    });

    this.elements.clearSearchBtn?.addEventListener('click', () => {
      if (this.elements.searchInput) {
        this.elements.searchInput.value = '';
        this.elements.clearSearchBtn.style.display = 'none';
        this.elements.searchInput.focus();
        this.renderCurrentTab();
      }
    });

    this.elements.btnOpenFiles?.addEventListener('click', () => this.onOpenFiles?.());
    this.elements.btnOpenFolder?.addEventListener('click', () => this.onOpenFolder?.());
  }

  private bindKeyboardNavigation(): void {
    this.drawer.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
        return;
      }

      const items = Array.from(this.drawer.querySelectorAll('.media-list-item')) as HTMLElement[];
      if (items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.focusedItemIndex = Math.min(items.length - 1, this.focusedItemIndex + 1);
        items[this.focusedItemIndex]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.focusedItemIndex = Math.max(0, this.focusedItemIndex - 1);
        items[this.focusedItemIndex]?.focus();
      } else if (e.key === 'Enter') {
        const focused = document.activeElement as HTMLElement;
        if (focused && focused.classList.contains('media-list-item')) {
          e.preventDefault();
          focused.click();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        const focused = document.activeElement as HTMLElement;
        if (focused && focused.classList.contains('media-list-item') && !e.target?.toString().includes('Input')) {
          const deleteBtn = focused.querySelector('.btn-item-action.btn-danger') as HTMLButtonElement;
          deleteBtn?.click();
        }
      }
    });
  }

  private updateSearchPlaceholder(): void {
    if (!this.elements.searchInput) return;

    switch (this.currentTab) {
      case 'queue':
        this.elements.searchInput.placeholder = 'Search queue...';
        break;
      case 'playlists':
        this.elements.searchInput.placeholder = 'Search playlists...';
        break;
      case 'history':
        this.elements.searchInput.placeholder = 'Search history...';
        break;
      case 'media':
        this.elements.searchInput.placeholder = 'Search tracks, artists, folders...';
        break;
    }
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

    this.focusedItemIndex = -1;
    this.closeInfoModal();

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

  private updateItemCount(count: number): void {
    if (this.elements.itemCountBadge) {
      this.elements.itemCountBadge.textContent = `${count} item${count === 1 ? '' : 's'}`;
    }
  }

  private renderQueue(): void {
    const content = this.elements.contentArea;
    if (!content) return;

    const state = this.controller.getState();
    const queue = state.queue;
    const currentIndex = state.queueIndex;
    const searchTerm = this.elements.searchInput?.value.toLowerCase() || '';

    this.updateItemCount(queue.length);
    this.renderFooterActions('queue');

    if (queue.length === 0) {
      content.innerHTML = `
        <div style="padding: 3.5rem 1.5rem; text-align: center; color: var(--text-muted);">
          <div style="display: flex; justify-content: center; margin-bottom: 0.85rem; opacity: 0.7; color: var(--accent-neon);">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">Queue is empty</div>
          <div style="font-size: 0.8rem; margin-top: 0.35rem; color: var(--text-muted);">Drop media files anywhere or open files to play</div>
        </div>
      `;
      return;
    }

    const filtered = queue
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !searchTerm || item.title.toLowerCase().includes(searchTerm));

    let html = '';

    filtered.forEach(({ item, index }) => {
      const isActive = index === currentIndex;
      const parsed = parseMediaDisplayTitle(item.title);
      const ext = item.metadata?.format?.toUpperCase() || item.uri.split('.').pop()?.toUpperCase() || 'FILE';
      const durationStr = item.duration > 0 ? this.formatTime(item.duration) : '--:--';
      const badgeStr = parsed.badges.length > 0 ? parsed.badges[0] : ext;

      html += `
        <div class="media-list-item ${isActive ? 'active' : ''}" data-queue-index="${index}" tabindex="0" role="button">
          <div class="media-item-left">
            <span class="media-item-index">${isActive ? '▶' : index + 1}</span>
            <div class="media-item-info">
              <span class="media-item-title" title="${this.escapeHtml(item.title)}">${this.escapeHtml(parsed.cleanTitle)}</span>
              <div class="media-item-subrow">
                <span class="item-badge">${this.escapeHtml(badgeStr)}</span>
                <span class="item-duration">${durationStr}</span>
                ${item.artist ? `<span class="item-meta-dot">•</span><span>${this.escapeHtml(item.artist)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn-item-action btn-play-now" data-queue-index="${index}" title="Play Now">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="btn-item-action btn-item-info" data-info-title="${this.escapeHtml(item.title)}" data-info-uri="${this.escapeHtml(item.uri)}" data-info-dur="${durationStr}" data-info-res="${item.metadata?.resolution || 'Auto'}" title="File Info">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </button>
            <button class="btn-item-action btn-danger btn-remove-queue-item" data-remove-index="${index}" title="Remove from Queue">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;

    // Attach listeners
    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-item-action')) return;
        const indexStr = (el as HTMLElement).dataset.queueIndex;
        if (indexStr) {
          const idx = parseInt(indexStr, 10);
          this.controller.setQueue(this.controller.getState().queue, idx);
        }
      });
    });

    content.querySelectorAll('.btn-play-now').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const indexStr = (btn as HTMLElement).dataset.queueIndex;
        if (indexStr) {
          this.controller.setQueue(this.controller.getState().queue, parseInt(indexStr, 10));
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

    content.querySelectorAll('.btn-item-info').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = btn as HTMLElement;
        this.showInfoModal({
          title: b.dataset.infoTitle || '',
          uri: b.dataset.infoUri || '',
          duration: b.dataset.infoDur || '',
          resolution: b.dataset.infoRes || 'Auto',
        });
      });
    });
  }

  private async renderPlaylists(): Promise<void> {
    const content = this.elements.contentArea;
    if (!content) return;

    content.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Loading playlists...</div>`;

    const playlists = this.onGetPlaylists ? await this.onGetPlaylists() : [];
    const searchTerm = this.elements.searchInput?.value.toLowerCase() || '';
    const filtered = playlists.filter((p) => !searchTerm || p.name.toLowerCase().includes(searchTerm));

    this.updateItemCount(playlists.length);
    this.renderFooterActions('playlists');

    if (filtered.length === 0) {
      content.innerHTML = `
        <div style="padding: 3.5rem 1.5rem; text-align: center; color: var(--text-muted);">
          <div style="display: flex; justify-content: center; margin-bottom: 0.85rem; opacity: 0.7; color: var(--accent-neon);">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
          </div>
          <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">No playlists found</div>
          <div style="font-size: 0.8rem; margin-top: 0.35rem; color: var(--text-muted);">Create custom playlists to organize your collection</div>
        </div>
      `;
      return;
    }

    let html = '';

    filtered.forEach((p) => {
      html += `
        <div class="media-list-item" data-playlist-id="${p.id}" tabindex="0" role="button">
          <div class="media-item-left">
            <span style="display: flex; align-items: center; opacity: 0.85; color: var(--accent-neon);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </span>
            <div class="media-item-info">
              <span class="media-item-title">${this.escapeHtml(p.name)}</span>
              <div class="media-item-subrow">
                <span class="item-badge">${p.itemCount} TRACKS</span>
                <span>Created ${new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn-item-action btn-play-playlist" data-playlist-id="${p.id}" title="Load Playlist">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="btn-item-action btn-danger btn-delete-playlist" data-playlist-id="${p.id}" title="Delete Playlist">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;

    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', async (e) => {
        if ((e.target as HTMLElement).closest('.btn-item-action')) return;
        const id = (el as HTMLElement).dataset.playlistId;
        if (id && this.onLoadPlaylist) {
          await this.onLoadPlaylist(id);
        }
      });
    });

    content.querySelectorAll('.btn-play-playlist').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.playlistId;
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

    content.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Loading playback history...</div>`;

    const history = this.onGetHistory ? await this.onGetHistory() : [];
    const searchTerm = this.elements.searchInput?.value.toLowerCase() || '';
    const filtered = history.filter((h) => !searchTerm || h.title.toLowerCase().includes(searchTerm));

    this.updateItemCount(history.length);
    this.renderFooterActions('history');

    if (filtered.length === 0) {
      content.innerHTML = `
        <div style="padding: 3.5rem 1.5rem; text-align: center; color: var(--text-muted);">
          <div style="display: flex; justify-content: center; margin-bottom: 0.85rem; opacity: 0.7; color: var(--accent-neon);">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">No playback history</div>
          <div style="font-size: 0.8rem; margin-top: 0.35rem; color: var(--text-muted);">Media you play will automatically appear here</div>
        </div>
      `;
      return;
    }

    let html = '';

    filtered.forEach((h) => {
      const parsed = parseMediaDisplayTitle(h.title);
      const pct = h.duration > 0 ? Math.min(100, Math.round((h.position / h.duration) * 100)) : 0;
      const resumeText = h.completed ? 'Completed' : `Resume at ${this.formatTime(h.position)} (${pct}%)`;

      html += `
        <div class="media-list-item" data-history-uri="${this.escapeHtml(h.uri)}" data-history-pos="${h.position}" tabindex="0" role="button">
          <div class="media-item-left">
            <span style="display: flex; align-items: center; opacity: 0.85; color: var(--accent-neon);">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <polyline points="12 6 12 12 16 14"></polyline>
              </svg>
            </span>
            <div class="media-item-info">
              <span class="media-item-title" title="${this.escapeHtml(h.title)}">${this.escapeHtml(parsed.cleanTitle)}</span>
              <div class="media-item-subrow">
                <span class="item-badge" style="color: ${h.completed ? 'var(--text-muted)' : 'var(--accent-neon)'};">${resumeText}</span>
                <span class="item-meta-dot">•</span>
                <span>${new Date(h.lastPlayedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
          ${
            !h.completed && pct > 0
              ? `<div class="item-progress-track"><div class="item-progress-fill" style="width: ${pct}%;"></div></div>`
              : ''
          }
          <div class="item-actions">
            <button class="btn-item-action btn-play-history" data-history-uri="${this.escapeHtml(h.uri)}" data-history-pos="${h.position}" title="Resume Playback">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="btn-item-action btn-add-history-queue" data-history-uri="${this.escapeHtml(h.uri)}" data-history-title="${this.escapeHtml(h.title)}" title="Add to Queue">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;

    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-item-action')) return;
        const uri = (el as HTMLElement).dataset.historyUri;
        const pos = parseFloat((el as HTMLElement).dataset.historyPos || '0');
        if (uri) {
          this.controller.load(uri, true).then(() => {
            if (pos > 0) this.controller.seek(pos);
          });
        }
      });
    });

    content.querySelectorAll('.btn-play-history').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = btn as HTMLElement;
        const uri = b.dataset.historyUri;
        const pos = parseFloat(b.dataset.historyPos || '0');
        if (uri) {
          this.controller.load(uri, true).then(() => {
            if (pos > 0) this.controller.seek(pos);
          });
        }
      });
    });

    content.querySelectorAll('.btn-add-history-queue').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = btn as HTMLElement;
        const uri = b.dataset.historyUri;
        const title = b.dataset.historyTitle || 'Media File';
        if (uri) {
          this.controller.addToQueue({
            id: `media_${Date.now()}`,
            uri,
            title,
            duration: 0,
            addedAt: Date.now(),
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

    this.updateItemCount(items.length);
    this.renderFooterActions('media');

    if (items.length === 0) {
      content.innerHTML = `
        <div style="padding: 3.5rem 1.5rem; text-align: center; color: var(--text-muted);">
          <div style="display: flex; justify-content: center; margin-bottom: 0.85rem; opacity: 0.7; color: var(--accent-neon);">
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="2.18"></rect>
              <line x1="7" y1="2" x2="7" y2="22"></line>
              <line x1="17" y1="2" x2="17" y2="22"></line>
              <line x1="2" y1="12" x2="22" y2="12"></line>
            </svg>
          </div>
          <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-primary);">No media items indexed</div>
          <div style="font-size: 0.8rem; margin-top: 0.35rem; color: var(--text-muted);">Scan a folder from the footer to populate your library</div>
        </div>
      `;
      return;
    }

    let html = '';

    items.forEach((item) => {
      const parsed = parseMediaDisplayTitle(item.title);
      const ext = item.metadata?.format?.toUpperCase() || item.uri.split('.').pop()?.toUpperCase() || 'FILE';
      const durationStr = item.duration > 0 ? this.formatTime(item.duration) : '--:--';
      const badgeStr = parsed.badges.length > 0 ? parsed.badges[0] : ext;

      html += `
        <div class="media-list-item" data-media-uri="${this.escapeHtml(item.uri)}" tabindex="0" role="button">
          <div class="media-item-left">
            <span style="display: flex; align-items: center; opacity: 0.85; color: var(--accent-neon);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </span>
            <div class="media-item-info">
              <span class="media-item-title" title="${this.escapeHtml(item.title)}">${this.escapeHtml(parsed.cleanTitle)}</span>
              <div class="media-item-subrow">
                <span class="item-badge">${this.escapeHtml(badgeStr)}</span>
                <span class="item-duration">${durationStr}</span>
                ${item.artist ? `<span class="item-meta-dot">•</span><span>${this.escapeHtml(item.artist)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="item-actions">
            <button class="btn-item-action btn-play-media" data-media-uri="${this.escapeHtml(item.uri)}" title="Play Now">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            </button>
            <button class="btn-item-action btn-add-media-queue" title="Add to Queue">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </button>
            <button class="btn-item-action btn-item-info" data-info-title="${this.escapeHtml(item.title)}" data-info-uri="${this.escapeHtml(item.uri)}" data-info-dur="${durationStr}" data-info-res="${item.metadata?.resolution || 'Auto'}" title="File Info">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    content.innerHTML = html;

    content.querySelectorAll('.media-list-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.btn-item-action')) return;
        const uri = (el as HTMLElement).dataset.mediaUri;
        if (uri) {
          this.controller.load(uri, true);
        }
      });
    });

    content.querySelectorAll('.btn-play-media').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const uri = (btn as HTMLElement).dataset.mediaUri;
        if (uri) {
          this.controller.load(uri, true);
        }
      });
    });

    content.querySelectorAll('.btn-add-media-queue').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const parent = (btn as HTMLElement).closest('.media-list-item') as HTMLElement | null;
        const uri = parent?.dataset.mediaUri;
        if (uri) {
          const title = parent?.querySelector('.media-item-title')?.textContent || 'Media File';
          this.controller.addToQueue({
            id: `media_${Date.now()}`,
            uri,
            title,
            duration: 0,
            addedAt: Date.now(),
          });
        }
      });
    });

    content.querySelectorAll('.btn-item-info').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = btn as HTMLElement;
        this.showInfoModal({
          title: b.dataset.infoTitle || '',
          uri: b.dataset.infoUri || '',
          duration: b.dataset.infoDur || '',
          resolution: b.dataset.infoRes || 'Auto',
        });
      });
    });
  }

  private renderFooterActions(tab: 'queue' | 'playlists' | 'history' | 'media'): void {
    const footer = this.elements.footerDynamic;
    if (!footer) return;

    switch (tab) {
      case 'queue':
        footer.innerHTML = `
          <button id="btn-shuffle-queue-footer" class="btn-footer-action" title="Shuffle Queue">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="16 3 21 3 21 8"></polyline>
              <line x1="4" y1="20" x2="21" y2="3"></line>
              <polyline points="21 16 21 21 16 21"></polyline>
              <line x1="15" y1="15" x2="21" y2="21"></line>
              <line x1="4" y1="4" x2="9" y2="9"></line>
            </svg>
          </button>
          <button id="btn-clear-queue-footer" class="btn-footer-action" style="color: var(--text-muted);" title="Clear Queue">Clear</button>
        `;
        footer.querySelector('#btn-shuffle-queue-footer')?.addEventListener('click', () => {
          this.controller.setShuffle(!this.controller.getState().shuffle);
        });
        footer.querySelector('#btn-clear-queue-footer')?.addEventListener('click', () => {
          this.controller.setQueue([]);
        });
        break;

      case 'playlists':
        footer.innerHTML = `
          <button id="btn-new-playlist-footer" class="btn-footer-action" style="background: var(--accent-neon); color: #fff; border-color: transparent;" title="Create Playlist">+ New</button>
        `;
        footer.querySelector('#btn-new-playlist-footer')?.addEventListener('click', async () => {
          const name = prompt('Enter playlist name:');
          if (name && this.onCreatePlaylist) {
            await this.onCreatePlaylist(name.trim());
            await this.renderPlaylists();
          }
        });
        break;

      case 'history':
        footer.innerHTML = `
          <button id="btn-clear-history-footer" class="btn-footer-action" style="color: var(--text-muted);" title="Clear Playback History">Clear History</button>
        `;
        footer.querySelector('#btn-clear-history-footer')?.addEventListener('click', async () => {
          if (confirm('Clear entire playback history?')) {
            if (this.onClearHistory) await this.onClearHistory();
            await this.renderHistory();
          }
        });
        break;

      case 'media':
        footer.innerHTML = ``;
        break;
    }
  }

  private showInfoModal(data: { title: string; uri: string; duration: string; resolution: string }): void {
    this.closeInfoModal();

    const modal = document.createElement('div');
    modal.className = 'item-info-modal';
    modal.id = 'active-info-modal';
    modal.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-subtle); padding-bottom: 0.5rem;">
        <span style="font-weight: 600; font-size: 0.9rem;">Media Information</span>
        <button id="btn-close-info-modal" class="btn-icon" style="min-width: 24px; height: 24px; padding: 0;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="info-row">
        <span class="info-label">Title:</span>
        <span class="info-value" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(data.title)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Duration:</span>
        <span class="info-value">${this.escapeHtml(data.duration)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Resolution:</span>
        <span class="info-value">${this.escapeHtml(data.resolution)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Location:</span>
        <span class="info-value" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escapeHtml(data.uri)}">${this.escapeHtml(data.uri)}</span>
      </div>
    `;

    this.drawer.appendChild(modal);

    modal.querySelector('#btn-close-info-modal')?.addEventListener('click', () => {
      this.closeInfoModal();
    });

    const onOutsideClick = (e: MouseEvent) => {
      if (!modal.contains(e.target as Node)) {
        this.closeInfoModal();
        document.removeEventListener('click', onOutsideClick);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', onOutsideClick);
    }, 10);
  }

  private closeInfoModal(): void {
    const existing = this.drawer.querySelector('#active-info-modal');
    existing?.remove();
  }

  private formatTime(seconds: number): string {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => n.toString().padStart(2, '0');
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
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
