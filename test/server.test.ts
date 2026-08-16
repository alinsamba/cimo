import { describe, expect, it, afterAll, beforeAll } from 'bun:test';
import { startCimoServer, type ServerInstance } from '../src/server';
import { writeFileSync, unlinkSync, mkdirSync, rmdirSync } from 'fs';
import { join } from 'path';

describe('Cimo Streaming Server & REST API', () => {
  let serverInstance: ServerInstance;
  let testFileDir = join(import.meta.dir, 'test_media');
  let testFilePath = join(testFileDir, 'sample_video.mp4');
  let baseUrl = '';

  beforeAll(() => {
    try {
      mkdirSync(testFileDir, { recursive: true });
      // Create a dummy 10KB media file
      const buffer = Buffer.alloc(10240, 0x5a);
      writeFileSync(testFilePath, buffer);
    } catch {}

    serverInstance = startCimoServer({
      port: 0, // OS assigns random available port
      host: '127.0.0.1',
      dbPath: ':memory:',
    });

    const port = serverInstance.server.port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    serverInstance.server.stop();
    serverInstance.db.close();
    try {
      unlinkSync(testFilePath);
      rmdirSync(testFileDir);
    } catch {}
  });

  it('serves main application HTML and CSS', async () => {
    const htmlRes = await fetch(`${baseUrl}/`);
    expect(htmlRes.status).toBe(200);
    expect(htmlRes.headers.get('content-type')).toContain('text/html');

    const cssRes = await fetch(`${baseUrl}/styles.css`);
    expect(cssRes.status).toBe(200);
    expect(cssRes.headers.get('content-type')).toContain('text/css');
  });

  it('handles HTTP 206 Partial Content range requests for video streaming', async () => {
    const streamUrl = `${baseUrl}/stream/${encodeURIComponent(testFilePath)}`;

    // 1. Full content request
    const fullRes = await fetch(streamUrl);
    expect(fullRes.status).toBe(200);
    expect(fullRes.headers.get('accept-ranges')).toBe('bytes');
    expect(fullRes.headers.get('content-length')).toBe('10240');

    // 2. Partial content range: bytes=0-1023 (first 1KB)
    const rangeRes1 = await fetch(streamUrl, {
      headers: { Range: 'bytes=0-1023' },
    });
    expect(rangeRes1.status).toBe(206);
    expect(rangeRes1.headers.get('content-range')).toBe('bytes 0-1023/10240');
    expect(rangeRes1.headers.get('content-length')).toBe('1024');
    const bytes1 = await rangeRes1.arrayBuffer();
    expect(bytes1.byteLength).toBe(1024);

    // 3. Partial content range: bytes=5000-9999
    const rangeRes2 = await fetch(streamUrl, {
      headers: { Range: 'bytes=5000-9999' },
    });
    expect(rangeRes2.status).toBe(206);
    expect(rangeRes2.headers.get('content-range')).toBe('bytes 5000-9999/10240');
    expect(rangeRes2.headers.get('content-length')).toBe('5000');
  });

  it('handles REST API for playlists, history, and resume position', async () => {
    // 1. Create Playlist
    const createRes = await fetch(`${baseUrl}/api/playlists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Favorites', description: 'Best clips' }),
    });
    const createData = (await createRes.json()) as { success: boolean; playlist: { id: string; name: string } };
    expect(createData.success).toBe(true);
    expect(createData.playlist.name).toBe('Favorites');

    // 2. Get Playlists
    const listRes = await fetch(`${baseUrl}/api/playlists`);
    const listData = (await listRes.json()) as { success: boolean; playlists: Array<{ id: string }> };
    expect(listData.success).toBe(true);
    expect(listData.playlists.length).toBeGreaterThanOrEqual(1);

    // 3. Save Resume Position
    const resumeRes = await fetch(`${baseUrl}/api/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mediaId: 'm1',
        uri: 'file:///sample.mp4',
        title: 'Sample Video',
        position: 45.5,
        duration: 120,
      }),
    });
    const resumeData = (await resumeRes.json()) as { success: boolean };
    expect(resumeData.success).toBe(true);

    // 4. Get History
    const historyRes = await fetch(`${baseUrl}/api/history`);
    const historyData = (await historyRes.json()) as { success: boolean; history: Array<{ title: string; position: number }> };
    expect(historyData.success).toBe(true);
    expect(historyData.history.length).toBe(1);
    expect(historyData.history[0].title).toBe('Sample Video');
    expect(historyData.history[0].position).toBe(45.5);
  });
});
