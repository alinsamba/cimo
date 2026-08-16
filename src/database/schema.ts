import type { Database } from 'bun:sqlite';

export interface MediaItemRow {
  id: string;
  uri: string;
  path: string | null;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  thumbnail: string | null;
  format: string | null;
  resolution: string | null;
  audio_channels: number | null;
  file_size: number | null;
  added_at: number;
}

export interface PlaybackHistoryRow {
  id: string;
  media_id: string | null;
  uri: string;
  title: string | null;
  position: number;
  duration: number;
  completed: number;
  last_played_at: number;
}

export interface PlaylistRow {
  id: string;
  name: string;
  description: string | null;
  created_at: number;
  updated_at: number;
}

export interface PlaylistItemRow {
  id: string;
  playlist_id: string;
  media_id: string;
  sort_order: number;
  added_at: number;
}

export interface TagRow {
  id: string;
  name: string;
}

export interface MediaTagRow {
  media_id: string;
  tag_id: string;
}

export const SCHEMA_SQL = `
-- Media items table
CREATE TABLE IF NOT EXISTS media_items (
  id TEXT PRIMARY KEY,
  uri TEXT UNIQUE NOT NULL,
  path TEXT,
  title TEXT NOT NULL,
  artist TEXT,
  album TEXT,
  duration REAL DEFAULT 0,
  thumbnail TEXT,
  format TEXT,
  resolution TEXT,
  audio_channels INTEGER,
  file_size INTEGER,
  added_at INTEGER NOT NULL
);

-- Playback history & resume positions
CREATE TABLE IF NOT EXISTS playback_history (
  id TEXT PRIMARY KEY,
  media_id TEXT,
  uri TEXT UNIQUE NOT NULL,
  title TEXT,
  position REAL NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  last_played_at INTEGER NOT NULL
);

-- Playlists
CREATE TABLE IF NOT EXISTS playlists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Playlist items (junction with ordering)
CREATE TABLE IF NOT EXISTS playlist_items (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL,
  media_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  added_at INTEGER NOT NULL,
  FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
  FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE
);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

-- Media Tags junction
CREATE TABLE IF NOT EXISTS media_tags (
  media_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (media_id, tag_id),
  FOREIGN KEY (media_id) REFERENCES media_items(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_media_items_uri ON media_items(uri);
CREATE INDEX IF NOT EXISTS idx_media_items_title ON media_items(title);
CREATE INDEX IF NOT EXISTS idx_playback_history_uri ON playback_history(uri);
CREATE INDEX IF NOT EXISTS idx_playback_history_media_id ON playback_history(media_id);
CREATE INDEX IF NOT EXISTS idx_playback_history_last_played_at ON playback_history(last_played_at);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_id ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_media_id ON playlist_items(media_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_sort ON playlist_items(playlist_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id);
CREATE INDEX IF NOT EXISTS idx_media_tags_tag_id ON media_tags(tag_id);
`;

export function initSchema(db: Database): void {
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA_SQL);
}
