import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MediaDatabase } from '../src/database/db';
import { DirectoryScanner, SUPPORTED_EXTENSIONS } from '../src/database/scanner';
import { initSchema } from '../src/database/schema';
import { Database } from 'bun:sqlite';

describe('MediaDatabase Schema & Initialization', () => {
  it('should initialize all tables and indexes without error', () => {
    const rawDb = new Database(':memory:');
    initSchema(rawDb);

    const tables = rawDb
      .prepare<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name ASC;"
      )
      .all()
      .map((t) => t.name);

    expect(tables).toContain('media_items');
    expect(tables).toContain('playback_history');
    expect(tables).toContain('playlists');
    expect(tables).toContain('playlist_items');
    expect(tables).toContain('tags');
    expect(tables).toContain('media_tags');

    rawDb.close();
  });

  it('should enforce foreign key cascade deletions', () => {
    const db = new MediaDatabase(':memory:');

    const item = db.saveMediaItem({
      uri: 'file:///media/video.mp4',
      title: 'Video',
    });

    const playlist = db.createPlaylist('Favorites');
    db.addMediaToPlaylist(playlist.id, item.id);
    db.addTag(item.id, 'Sci-Fi');

    expect(db.getTagsForMedia(item.id)).toEqual(['Sci-Fi']);
    expect(db.getPlaylist(playlist.id)?.items.length).toBe(1);

    // Delete media item
    const deleted = db.deleteMediaItem(item.id);
    expect(deleted).toBe(true);

    // Check cascade cleanup
    expect(db.getTagsForMedia(item.id)).toEqual([]);
    expect(db.getPlaylist(playlist.id)?.items.length).toBe(0);

    db.close();
  });
});

describe('MediaDatabase CRUD Operations', () => {
  let db: MediaDatabase;

  beforeEach(() => {
    db = new MediaDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should save, retrieve by id and uri, and update media items', () => {
    const item = db.saveMediaItem({
      uri: 'file:///music/song.flac',
      title: 'Bohemian Rhapsody',
      artist: 'Queen',
      album: 'A Night at the Opera',
      duration: 354,
      metadata: {
        format: 'flac',
        audioChannels: 2,
        fileSize: 45000000,
      },
    });

    expect(item.id).toBeDefined();
    expect(item.title).toBe('Bohemian Rhapsody');
    expect(item.artist).toBe('Queen');
    expect(item.album).toBe('A Night at the Opera');
    expect(item.duration).toBe(354);
    expect(item.metadata?.format).toBe('flac');
    expect(item.metadata?.audioChannels).toBe(2);
    expect(item.metadata?.fileSize).toBe(45000000);

    // Get by ID
    const byId = db.getMediaItem(item.id);
    expect(byId).not.toBeNull();
    expect(byId?.title).toBe('Bohemian Rhapsody');

    // Get by URI
    const byUri = db.getMediaItemByUri('file:///music/song.flac');
    expect(byUri).not.toBeNull();
    expect(byUri?.id).toBe(item.id);

    // Update existing item via URI
    const updated = db.saveMediaItem({
      uri: 'file:///music/song.flac',
      title: 'Bohemian Rhapsody (2011 Remaster)',
      duration: 355,
      artist: 'Queen',
    });

    expect(updated.id).toBe(item.id);
    expect(updated.title).toBe('Bohemian Rhapsody (2011 Remaster)');
    expect(updated.duration).toBe(355);

    const retrievedAgain = db.getMediaItem(item.id);
    expect(retrievedAgain?.title).toBe('Bohemian Rhapsody (2011 Remaster)');
  });

  it('should delete media items', () => {
    const item = db.saveMediaItem({
      uri: 'file:///video/clip.mp4',
      title: 'Short Clip',
    });

    expect(db.getMediaItem(item.id)).not.toBeNull();
    const deleted = db.deleteMediaItem(item.id);
    expect(deleted).toBe(true);
    expect(db.getMediaItem(item.id)).toBeNull();

    // Deleting non-existent item returns false
    expect(db.deleteMediaItem('non-existent-id')).toBe(false);
  });

  it('should search and paginate media items', () => {
    db.saveMediaItem({
      uri: 'file:///media/track1.mp3',
      title: 'Stairway to Heaven',
      artist: 'Led Zeppelin',
      album: 'Led Zeppelin IV',
    });
    db.saveMediaItem({
      uri: 'file:///media/track2.mp3',
      title: 'Hotel California',
      artist: 'Eagles',
      album: 'Hotel California',
    });
    db.saveMediaItem({
      uri: 'file:///media/track3.mp3',
      title: 'Kashmir',
      artist: 'Led Zeppelin',
      album: 'Physical Graffiti',
    });

    // Search by artist
    const ledZeppelin = db.getAllMedia({ search: 'Led Zeppelin' });
    expect(ledZeppelin.length).toBe(2);

    // Search by title
    const hotel = db.getAllMedia({ search: 'Hotel' });
    expect(hotel.length).toBe(1);
    expect(hotel[0]?.title).toBe('Hotel California');

    // Pagination
    const allItems = db.getAllMedia();
    expect(allItems.length).toBe(3);

    const page1 = db.getAllMedia({ limit: 2, offset: 0 });
    expect(page1.length).toBe(2);

    const page2 = db.getAllMedia({ limit: 2, offset: 2 });
    expect(page2.length).toBe(1);
  });
});

describe('Playback History & Resume Positions', () => {
  let db: MediaDatabase;

  beforeEach(() => {
    db = new MediaDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should record and update resume positions', () => {
    const item = db.saveMediaItem({
      uri: 'file:///movie.mp4',
      title: 'Interstellar',
      duration: 10000,
    });

    db.saveResumePosition(item.id, item.uri, item.title, 2500, 10000);

    const resume = db.getResumePosition(item.uri);
    expect(resume).not.toBeNull();
    expect(resume?.position).toBe(2500);
    expect(resume?.duration).toBe(10000);
    expect(resume?.completed).toBe(false);

    // Update to near end (completed)
    db.saveResumePosition(item.id, item.uri, item.title, 9600, 10000);
    const resumeCompleted = db.getResumePosition(item.uri);
    expect(resumeCompleted?.completed).toBe(true);
    expect(resumeCompleted?.position).toBe(9600);
  });

  it('should return playback history in reverse chronological order', () => {
    const item1 = db.saveMediaItem({ uri: 'file:///1.mp3', title: 'Song 1' });
    const item2 = db.saveMediaItem({ uri: 'file:///2.mp3', title: 'Song 2' });

    db.saveResumePosition(item1.id, item1.uri, item1.title, 50, 200);
    // Small delay to ensure timestamp difference
    db.saveResumePosition(item2.id, item2.uri, item2.title, 120, 300);

    const history = db.getPlaybackHistory(10);
    expect(history.length).toBe(2);
    expect(history[0]?.uri).toBe(item2.uri);
    expect(history[1]?.uri).toBe(item1.uri);

    db.clearPlaybackHistory();
    expect(db.getPlaybackHistory().length).toBe(0);
  });
});

describe('Playlist Management', () => {
  let db: MediaDatabase;

  beforeEach(() => {
    db = new MediaDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should create, list, and delete playlists', () => {
    const p1 = db.createPlaylist('Rock Classics', 'Best of rock');
    const p2 = db.createPlaylist('Jazz Essentials');

    expect(p1.id).toBeDefined();
    expect(p1.name).toBe('Rock Classics');
    expect(p1.description).toBe('Best of rock');
    expect(p1.itemCount).toBe(0);

    const playlists = db.getPlaylists();
    expect(playlists.length).toBe(2);

    const deleted = db.deletePlaylist(p1.id);
    expect(deleted).toBe(true);
    expect(db.getPlaylists().length).toBe(1);
  });

  it('should add, remove, and reorder playlist items', () => {
    const p = db.createPlaylist('Chillout');
    const m1 = db.saveMediaItem({ uri: 'file:///track1.mp3', title: 'Track 1' });
    const m2 = db.saveMediaItem({ uri: 'file:///track2.mp3', title: 'Track 2' });
    const m3 = db.saveMediaItem({ uri: 'file:///track3.mp3', title: 'Track 3' });

    db.addMediaToPlaylist(p.id, m1.id);
    db.addMediaToPlaylist(p.id, m2.id);
    db.addMediaToPlaylist(p.id, m3.id);

    let playlistData = db.getPlaylist(p.id);
    expect(playlistData).not.toBeNull();
    expect(playlistData?.playlist.itemCount).toBe(3);
    expect(playlistData?.items.map((i) => i.id)).toEqual([m1.id, m2.id, m3.id]);

    // Reorder: m3, m1, m2
    db.reorderPlaylistItems(p.id, [m3.id, m1.id, m2.id]);

    playlistData = db.getPlaylist(p.id);
    expect(playlistData?.items.map((i) => i.id)).toEqual([m3.id, m1.id, m2.id]);

    // Remove item m1
    db.removeMediaFromPlaylist(p.id, m1.id);
    playlistData = db.getPlaylist(p.id);
    expect(playlistData?.playlist.itemCount).toBe(2);
    expect(playlistData?.items.map((i) => i.id)).toEqual([m3.id, m2.id]);
  });
});

describe('Tags Management', () => {
  let db: MediaDatabase;

  beforeEach(() => {
    db = new MediaDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  it('should add, get, remove tags and filter media by tag', () => {
    const item1 = db.saveMediaItem({ uri: 'file:///1.mp4', title: 'Action Movie' });
    const item2 = db.saveMediaItem({ uri: 'file:///2.mp4', title: 'Comedy Movie' });

    db.addTag(item1.id, 'Action');
    db.addTag(item1.id, '4K');
    db.addTag(item2.id, 'Comedy');

    expect(db.getTagsForMedia(item1.id)).toEqual(['4K', 'Action']);
    expect(db.getTagsForMedia(item2.id)).toEqual(['Comedy']);

    const actionMovies = db.getAllMedia({ tag: 'Action' });
    expect(actionMovies.length).toBe(1);
    expect(actionMovies[0]?.id).toBe(item1.id);

    // Case-insensitive tag matching
    const actionLower = db.getAllMedia({ tag: 'action' });
    expect(actionLower.length).toBe(1);
    expect(actionLower[0]?.id).toBe(item1.id);

    // Remove tag
    db.removeTag(item1.id, 'Action');
    expect(db.getTagsForMedia(item1.id)).toEqual(['4K']);
    expect(db.getAllMedia({ tag: 'Action' }).length).toBe(0);
  });
});

describe('DirectoryScanner', () => {
  let db: MediaDatabase;
  let scanner: DirectoryScanner;
  let testDir: string;

  beforeEach(async () => {
    db = new MediaDatabase(':memory:');
    scanner = new DirectoryScanner(db, { batchSize: 2 });

    testDir = join(tmpdir(), `cimo-scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(testDir, { recursive: true });

    // Create folder structure with media and non-media files
    const musicSubDir = join(testDir, 'Music');
    const videoSubDir = join(testDir, 'Videos', 'SciFi');
    await mkdir(musicSubDir, { recursive: true });
    await mkdir(videoSubDir, { recursive: true });

    await writeFile(join(musicSubDir, 'Daft Punk - Get Lucky.flac'), 'dummy flac content');
    await writeFile(join(musicSubDir, 'The Beatles - Yesterday.mp3'), 'dummy mp3 content');
    await writeFile(join(videoSubDir, 'Inception.mkv'), 'dummy mkv content');
    await writeFile(join(testDir, 'sample.mp4'), 'dummy mp4 content');
    await writeFile(join(testDir, 'notes.txt'), 'unsupported text file');
    await writeFile(join(testDir, 'cover.jpg'), 'unsupported image file');
  });

  afterEach(async () => {
    db.close();
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should correctly identify supported extensions', () => {
    expect(scanner.isSupported('video.mp4')).toBe(true);
    expect(scanner.isSupported('song.FLAC')).toBe(true);
    expect(scanner.isSupported('audio.opus')).toBe(true);
    expect(scanner.isSupported('doc.pdf')).toBe(false);
    expect(scanner.isSupported('notes.txt')).toBe(false);
  });

  it('should extract metadata from file path', async () => {
    const filePath = join(testDir, 'Music', 'Daft Punk - Get Lucky.flac');
    const meta = await scanner.extractFileMetadata(filePath);

    expect(meta).not.toBeNull();
    expect(meta?.title).toBe('Get Lucky');
    expect(meta?.artist).toBe('Daft Punk');
    expect(meta?.metadata?.format).toBe('flac');
    expect(meta?.metadata?.fileSize).toBeGreaterThan(0);
    expect(meta?.uri.startsWith('file://')).toBe(true);
  });

  it('should scan directory recursively and ingest media into database', async () => {
    let progressUpdates = 0;
    const result = await scanner.scanDirectory(testDir, {
      onProgress: () => {
        progressUpdates++;
      },
    });

    expect(result.totalScanned).toBe(4);
    expect(result.totalIngested).toBe(4);
    expect(result.items.length).toBe(4);
    expect(result.errors.length).toBe(0);
    expect(progressUpdates).toBeGreaterThanOrEqual(4);

    const allDbItems = db.getAllMedia();
    expect(allDbItems.length).toBe(4);

    const titles = allDbItems.map((i) => i.title);
    expect(titles).toContain('Get Lucky');
    expect(titles).toContain('Yesterday');
    expect(titles).toContain('Inception');
    expect(titles).toContain('sample');
  });

  it('should scan specific list of files', async () => {
    const file1 = join(testDir, 'sample.mp4');
    const file2 = join(testDir, 'Music', 'The Beatles - Yesterday.mp3');

    const result = await scanner.scanFiles([file1, file2]);
    expect(result.totalScanned).toBe(2);
    expect(result.totalIngested).toBe(2);
    expect(result.items.length).toBe(2);

    const item = db.getMediaItemByUri(result.items[0]!.uri);
    expect(item).not.toBeNull();
  });
});
