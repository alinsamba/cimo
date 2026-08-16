import { Database } from 'bun:sqlite';
import {
  initSchema,
  type MediaItemRow,
  type PlaybackHistoryRow,
  type PlaybackStateRow,
  type PlaylistRow,
} from './schema';
import type {
  MediaItem,
  PlaybackHistoryItem,
  Playlist,
} from '../core/types';
import type { PlaybackResumeState } from '../core/resume';
export interface GetAllMediaQuery {
  search?: string;
  tag?: string;
  limit?: number;
  offset?: number;
}

export interface PlaylistWithItems {
  playlist: Playlist;
  items: MediaItem[];
}

export interface ResumePosition {
  position: number;
  duration: number;
  completed: boolean;
}

export class MediaDatabase {
  private db: Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    initSchema(this.db);
  }

  public get rawDb(): Database {
    return this.db;
  }

  private rowToMediaItem(row: MediaItemRow): MediaItem {
    return {
      id: row.id,
      uri: row.uri,
      path: row.path ?? undefined,
      title: row.title,
      artist: row.artist ?? undefined,
      album: row.album ?? undefined,
      duration: row.duration ?? 0,
      thumbnail: row.thumbnail ?? undefined,
      addedAt: row.added_at,
      metadata: {
        title: row.title,
        artist: row.artist ?? undefined,
        album: row.album ?? undefined,
        artwork: row.thumbnail ?? undefined,
        duration: row.duration ?? 0,
        resolution: row.resolution ?? undefined,
        format: row.format ?? undefined,
        audioChannels: row.audio_channels ?? undefined,
        fileSize: row.file_size ?? undefined,
        path: row.path ?? undefined,
      },
    };
  }

  public saveMediaItem(item: Partial<MediaItem> & { uri: string; title: string }): MediaItem {
    const existing = this.getMediaItemByUri(item.uri);
    const id = item.id ?? existing?.id ?? crypto.randomUUID();
    const addedAt = item.addedAt ?? existing?.addedAt ?? Date.now();

    const path = item.path ?? item.metadata?.path ?? existing?.path ?? null;
    const title = item.title ?? existing?.title ?? 'Untitled';
    const artist = item.artist ?? item.metadata?.artist ?? existing?.artist ?? null;
    const album = item.album ?? item.metadata?.album ?? existing?.album ?? null;
    const duration = item.duration ?? item.metadata?.duration ?? existing?.duration ?? 0;
    const thumbnail = item.thumbnail ?? item.metadata?.artwork ?? existing?.thumbnail ?? null;
    const format = item.metadata?.format ?? existing?.metadata?.format ?? null;
    const resolution =
      item.metadata?.resolution ??
      (item.metadata?.width && item.metadata?.height
        ? `${item.metadata.width}x${item.metadata.height}`
        : existing?.metadata?.resolution ?? null);
    const audioChannels =
      item.metadata?.audioChannels ?? existing?.metadata?.audioChannels ?? null;
    const fileSize = item.metadata?.fileSize ?? existing?.metadata?.fileSize ?? null;

    const stmt = this.db.prepare<
      void,
      [
        string,
        string,
        string | null,
        string,
        string | null,
        string | null,
        number,
        string | null,
        string | null,
        string | null,
        number | null,
        number | null,
        number,
      ]
    >(`
      INSERT INTO media_items (
        id, uri, path, title, artist, album, duration, thumbnail, format, resolution, audio_channels, file_size, added_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uri) DO UPDATE SET
        path = excluded.path,
        title = excluded.title,
        artist = excluded.artist,
        album = excluded.album,
        duration = excluded.duration,
        thumbnail = excluded.thumbnail,
        format = excluded.format,
        resolution = excluded.resolution,
        audio_channels = excluded.audio_channels,
        file_size = excluded.file_size
    `);

    stmt.run(
      id,
      item.uri,
      path,
      title,
      artist,
      album,
      duration,
      thumbnail,
      format,
      resolution,
      audioChannels,
      fileSize,
      addedAt
    );

    const saved = this.getMediaItem(id);
    if (!saved) {
      // Fallback if query by id returns null due to existing URI having different id
      const byUri = this.getMediaItemByUri(item.uri);
      if (byUri) return byUri;
      throw new Error(`Failed to save media item with URI: ${item.uri}`);
    }
    return saved;
  }

  public getMediaItem(id: string): MediaItem | null {
    const row = this.db
      .prepare<MediaItemRow, [string]>('SELECT * FROM media_items WHERE id = ?')
      .get(id);
    return row ? this.rowToMediaItem(row) : null;
  }

  public getMediaItemByUri(uri: string): MediaItem | null {
    const row = this.db
      .prepare<MediaItemRow, [string]>('SELECT * FROM media_items WHERE uri = ?')
      .get(uri);
    return row ? this.rowToMediaItem(row) : null;
  }

  public getAllMedia(query?: GetAllMediaQuery): MediaItem[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    let sql = 'SELECT m.* FROM media_items m';

    if (query?.tag) {
      sql += ' JOIN media_tags mt ON m.id = mt.media_id JOIN tags t ON mt.tag_id = t.id';
      conditions.push('LOWER(t.name) = LOWER(?)');
      params.push(query.tag);
    }

    if (query?.search && query.search.trim().length > 0) {
      const searchTerm = `%${query.search.trim()}%`;
      conditions.push(
        '(m.title LIKE ? OR m.artist LIKE ? OR m.album LIKE ? OR m.path LIKE ?)'
      );
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' ORDER BY m.added_at DESC, m.id DESC';

    if (query?.limit !== undefined && query.limit > 0) {
      sql += ' LIMIT ?';
      params.push(query.limit);
      if (query?.offset !== undefined && query.offset > 0) {
        sql += ' OFFSET ?';
        params.push(query.offset);
      }
    } else if (query?.offset !== undefined && query.offset > 0) {
      sql += ' LIMIT -1 OFFSET ?';
      params.push(query.offset);
    }

    const rows = this.db.prepare<MediaItemRow, (string | number)[]>(sql).all(...params);
    return rows.map((row) => this.rowToMediaItem(row));
  }

  public deleteMediaItem(id: string): boolean {
    const res = this.db.prepare<void, [string]>('DELETE FROM media_items WHERE id = ?').run(id);
    return res.changes > 0;
  }

  public saveResumePosition(
    mediaId: string,
    uri: string,
    title: string,
    position: number,
    duration: number
  ): void {
    const id = crypto.randomUUID();
    const isCompleted =
      duration > 0 && (position / duration >= 0.95 || duration - position < 5);
    const completedInt = isCompleted ? 1 : 0;
    const now = Date.now();

    const stmt = this.db.prepare<
      void,
      [string, string, string, string, number, number, number, number]
    >(`
      INSERT INTO playback_history (
        id, media_id, uri, title, position, duration, completed, last_played_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(uri) DO UPDATE SET
        media_id = excluded.media_id,
        title = excluded.title,
        position = excluded.position,
        duration = excluded.duration,
        completed = excluded.completed,
        last_played_at = excluded.last_played_at
    `);

    stmt.run(id, mediaId, uri, title, position, duration, completedInt, now);
  }

  public getResumePosition(uri: string): ResumePosition | null {
    const row = this.db
      .prepare<PlaybackHistoryRow, [string]>(
        'SELECT position, duration, completed FROM playback_history WHERE uri = ?'
      )
      .get(uri);

    if (!row) {
      return null;
    }

    return {
      position: row.position,
      duration: row.duration,
      completed: row.completed === 1,
    };
  }

  public getPlaybackHistory(limit: number = 50): PlaybackHistoryItem[] {
    const rows = this.db
      .prepare<PlaybackHistoryRow, [number]>(
        'SELECT * FROM playback_history ORDER BY last_played_at DESC LIMIT ?'
      )
      .all(limit);

    return rows.map((row) => ({
      id: row.id,
      mediaId: row.media_id ?? '',
      uri: row.uri,
      title: row.title ?? '',
      position: row.position,
      duration: row.duration,
      completed: row.completed === 1,
      lastPlayedAt: row.last_played_at,
    }));
  }

  public clearPlaybackHistory(): void {
    this.db.exec('DELETE FROM playback_history;');
  }
  public savePlaybackResumeState(state: PlaybackResumeState): void {
    const completedInt = state.completed ? 1 : 0;
    const now = state.updatedAt || Date.now();

    this.db.prepare<
      void,
      [string, string | null, number, number, string | null, string | null, number, number, number]
    >(`
      INSERT INTO playback_state (
        file_hash, canonical_path, position_ms, duration_ms, audio_track_id, subtitle_track_id, volume, completed, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(file_hash) DO UPDATE SET
        position_ms = excluded.position_ms,
        duration_ms = excluded.duration_ms,
        audio_track_id = excluded.audio_track_id,
        subtitle_track_id = excluded.subtitle_track_id,
        volume = excluded.volume,
        completed = excluded.completed,
        updated_at = excluded.updated_at
    `).run(
      state.fileHash,
      null,
      state.positionMs,
      state.durationMs,
      state.audioTrackId ?? null,
      state.subtitleTrackId ?? null,
      state.volume ?? 1.0,
      completedInt,
      now
    );

    // Auto-prune LRU entries beyond 1,000 to keep database lightweight
    this.prunePlaybackStates(1000);
  }

  public getPlaybackResumeState(fileHash: string): PlaybackResumeState | null {
    const row = this.db
      .prepare<PlaybackStateRow, [string]>(
        'SELECT * FROM playback_state WHERE file_hash = ?'
      )
      .get(fileHash);

    if (!row) return null;

    return {
      fileHash: row.file_hash,
      positionMs: row.position_ms,
      durationMs: row.duration_ms,
      audioTrackId: row.audio_track_id ?? undefined,
      subtitleTrackId: row.subtitle_track_id ?? undefined,
      volume: row.volume ?? 1.0,
      completed: row.completed === 1,
      updatedAt: row.updated_at,
    };
  }

  public prunePlaybackStates(maxEntries: number = 1000): number {
    const res = this.db.prepare<void, [number]>(`
      DELETE FROM playback_state
      WHERE file_hash NOT IN (
        SELECT file_hash FROM playback_state
        ORDER BY updated_at DESC
        LIMIT ?
      )
    `).run(maxEntries);

    return res.changes;
  }


  public createPlaylist(name: string, description?: string): Playlist {
    const id = crypto.randomUUID();
    const now = Date.now();
    const desc = description ?? null;

    this.db
      .prepare<void, [string, string, string | null, number, number]>(
        'INSERT INTO playlists (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, name, desc, now, now);

    return {
      id,
      name,
      description: description ?? undefined,
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  public getPlaylists(): Playlist[] {
    interface PlaylistWithCountRow extends PlaylistRow {
      item_count: number;
    }

    const rows = this.db
      .prepare<PlaylistWithCountRow, []>(`
        SELECT p.id, p.name, p.description, p.created_at, p.updated_at, COUNT(pi.id) as item_count
        FROM playlists p
        LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
        GROUP BY p.id
        ORDER BY p.updated_at DESC, p.created_at DESC
      `)
      .all();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      itemCount: row.item_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  public getPlaylist(id: string): PlaylistWithItems | null {
    interface PlaylistWithCountRow extends PlaylistRow {
      item_count: number;
    }

    const playlistRow = this.db
      .prepare<PlaylistWithCountRow, [string]>(`
        SELECT p.id, p.name, p.description, p.created_at, p.updated_at, COUNT(pi.id) as item_count
        FROM playlists p
        LEFT JOIN playlist_items pi ON p.id = pi.playlist_id
        WHERE p.id = ?
        GROUP BY p.id
      `)
      .get(id);

    if (!playlistRow) {
      return null;
    }

    const playlist: Playlist = {
      id: playlistRow.id,
      name: playlistRow.name,
      description: playlistRow.description ?? undefined,
      itemCount: playlistRow.item_count,
      createdAt: playlistRow.created_at,
      updatedAt: playlistRow.updated_at,
    };

    const mediaRows = this.db
      .prepare<MediaItemRow, [string]>(`
        SELECT m.*
        FROM media_items m
        JOIN playlist_items pi ON m.id = pi.media_id
        WHERE pi.playlist_id = ?
        ORDER BY pi.sort_order ASC, pi.added_at ASC
      `)
      .all(id);

    const items = mediaRows.map((row) => this.rowToMediaItem(row));

    return {
      playlist,
      items,
    };
  }

  public addMediaToPlaylist(playlistId: string, mediaId: string, sortOrder?: number): void {
    const playlist = this.db
      .prepare<{ id: string }, [string]>('SELECT id FROM playlists WHERE id = ?')
      .get(playlistId);

    if (!playlist) {
      throw new Error(`Playlist with id "${playlistId}" does not exist`);
    }

    const media = this.db
      .prepare<{ id: string }, [string]>('SELECT id FROM media_items WHERE id = ?')
      .get(mediaId);

    if (!media) {
      throw new Error(`Media item with id "${mediaId}" does not exist`);
    }

    let targetOrder = sortOrder;
    if (targetOrder === undefined) {
      const maxRow = this.db
        .prepare<{ max_order: number | null }, [string]>(
          'SELECT MAX(sort_order) as max_order FROM playlist_items WHERE playlist_id = ?'
        )
        .get(playlistId);
      targetOrder = (maxRow?.max_order ?? -1) + 1;
    }

    const itemId = crypto.randomUUID();
    const now = Date.now();

    const insertItem = this.db.prepare<void, [string, string, string, number, number]>(
      'INSERT INTO playlist_items (id, playlist_id, media_id, sort_order, added_at) VALUES (?, ?, ?, ?, ?)'
    );
    const updatePlaylist = this.db.prepare<void, [number, string]>(
      'UPDATE playlists SET updated_at = ? WHERE id = ?'
    );

    const transaction = this.db.transaction(() => {
      insertItem.run(itemId, playlistId, mediaId, targetOrder!, now);
      updatePlaylist.run(now, playlistId);
    });

    transaction();
  }

  public removeMediaFromPlaylist(playlistId: string, mediaId: string): void {
    const deleteItem = this.db.prepare<void, [string, string]>(
      'DELETE FROM playlist_items WHERE playlist_id = ? AND media_id = ?'
    );
    const updatePlaylist = this.db.prepare<void, [number, string]>(
      'UPDATE playlists SET updated_at = ? WHERE id = ?'
    );

    const now = Date.now();
    const transaction = this.db.transaction(() => {
      deleteItem.run(playlistId, mediaId);
      updatePlaylist.run(now, playlistId);
    });

    transaction();
  }

  public reorderPlaylistItems(playlistId: string, itemIdsInOrder: string[]): void {
    const now = Date.now();
    const updateOrder = this.db.prepare<void, [number, string, string, string]>(
      'UPDATE playlist_items SET sort_order = ? WHERE playlist_id = ? AND (media_id = ? OR id = ?)'
    );
    const updatePlaylist = this.db.prepare<void, [number, string]>(
      'UPDATE playlists SET updated_at = ? WHERE id = ?'
    );

    const transaction = this.db.transaction(() => {
      for (let i = 0; i < itemIdsInOrder.length; i++) {
        const id = itemIdsInOrder[i]!;
        updateOrder.run(i, playlistId, id, id);
      }
      updatePlaylist.run(now, playlistId);
    });

    transaction();
  }

  public deletePlaylist(id: string): boolean {
    const res = this.db.prepare<void, [string]>('DELETE FROM playlists WHERE id = ?').run(id);
    return res.changes > 0;
  }

  public addTag(mediaId: string, tagName: string): void {
    const normalized = tagName.trim();
    if (!normalized) return;

    const media = this.db
      .prepare<{ id: string }, [string]>('SELECT id FROM media_items WHERE id = ?')
      .get(mediaId);

    if (!media) {
      throw new Error(`Media item with id "${mediaId}" does not exist`);
    }

    const tagId = crypto.randomUUID();
    const insertTag = this.db.prepare<void, [string, string]>(
      'INSERT INTO tags (id, name) VALUES (?, ?) ON CONFLICT(name) DO NOTHING'
    );
    const getTag = this.db.prepare<{ id: string }, [string]>('SELECT id FROM tags WHERE name = ?');
    const linkTag = this.db.prepare<void, [string, string]>(
      'INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)'
    );

    const transaction = this.db.transaction(() => {
      insertTag.run(tagId, normalized);
      const existingTag = getTag.get(normalized);
      if (existingTag) {
        linkTag.run(mediaId, existingTag.id);
      }
    });

    transaction();
  }

  public removeTag(mediaId: string, tagName: string): void {
    const normalized = tagName.trim();
    if (!normalized) return;

    const getTag = this.db.prepare<{ id: string }, [string]>(
      'SELECT id FROM tags WHERE LOWER(name) = LOWER(?)'
    );
    const unlinkTag = this.db.prepare<void, [string, string]>(
      'DELETE FROM media_tags WHERE media_id = ? AND tag_id = ?'
    );

    const transaction = this.db.transaction(() => {
      const tag = getTag.get(normalized);
      if (tag) {
        unlinkTag.run(mediaId, tag.id);
      }
    });

    transaction();
  }

  public getTagsForMedia(mediaId: string): string[] {
    const rows = this.db
      .prepare<{ name: string }, [string]>(`
        SELECT t.name
        FROM tags t
        JOIN media_tags mt ON t.id = mt.tag_id
        WHERE mt.media_id = ?
        ORDER BY t.name ASC
      `)
      .all(mediaId);

    return rows.map((r) => r.name);
  }

  public close(): void {
    this.db.close();
  }
}
