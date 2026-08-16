import { serve } from 'bun';
import { join, resolve } from 'path';
import { stat, readdir } from 'fs/promises';
import { MediaDatabase } from './database/db';
import { DirectoryScanner } from './database/scanner';

export interface ServerOptions {
  port?: number;
  host?: string;
  dbPath?: string;
  mediaRoot?: string;
}

export interface ServerInstance {
  server: ReturnType<typeof serve>;
  db: MediaDatabase;
  scanner: DirectoryScanner;
  port: number;
  host: string;
}

export function startCimoServer(options?: ServerOptions): ServerInstance {
  const port = typeof options?.port === 'number' ? options.port : 3000;
  const host = options?.host || '127.0.0.1';
  const db = new MediaDatabase(options?.dbPath || 'cimo.db');
  const scanner = new DirectoryScanner(db);

  const server = serve({
    port,
    hostname: host,
    async fetch(req) {
      const url = new URL(req.url);
      const pathname = url.pathname;

      // API Endpoints
      if (pathname.startsWith('/api/')) {
        return handleApi(req, pathname, db, scanner);
      }

      // Media File Streaming with HTTP 206 Partial Content (Byte Range Requests)
      if (pathname.startsWith('/stream/')) {
        const filePath = decodeURIComponent(pathname.replace('/stream/', ''));
        return handleStream(req, filePath);
      }

      // Static UI files
      if (pathname === '/' || pathname === '/index.html') {
        const file = Bun.file(join(import.meta.dir, 'ui/index.html'));
        return new Response(file, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }

      if (pathname === '/styles.css') {
        const file = Bun.file(join(import.meta.dir, 'ui/styles.css'));
        return new Response(file, { headers: { 'Content-Type': 'text/css; charset=utf-8' } });
      }

      // JS / TS Bundling on-the-fly for browser
      if (pathname === '/app.ts' || pathname.endsWith('.ts') || pathname.endsWith('.js')) {
        const relPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
        let filePath = join(import.meta.dir, 'ui', relPath);
        if (!(await Bun.file(filePath).exists())) {
          filePath = join(import.meta.dir, relPath);
        }

        if (await Bun.file(filePath).exists()) {
          const build = await Bun.build({
            entrypoints: [filePath],
            target: 'browser',
            format: 'esm',
            minify: false,
          });

          if (build.success && build.outputs.length > 0) {
            const code = await build.outputs[0].text();
            return new Response(code, {
              headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
            });
          }
        }
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  return { server, db, scanner, port, host };
}

async function handleApi(req: Request, pathname: string, db: MediaDatabase, scanner: DirectoryScanner): Promise<Response> {
  const url = new URL(req.url);

  if (pathname === '/api/media' && req.method === 'GET') {
    const search = url.searchParams.get('search') || undefined;
    const tag = url.searchParams.get('tag') || undefined;
    const items = db.getAllMedia({ search, tag });
    return Response.json({ success: true, items });
  }

  if (pathname === '/api/scan' && req.method === 'POST') {
    const body = (await req.json()) as { dirPath?: string };
    if (!body.dirPath) {
      return Response.json({ success: false, error: 'dirPath is required' }, { status: 400 });
    }
    const count = await scanner.scanDirectory(body.dirPath);
    return Response.json({ success: true, count });
  }

  if (pathname === '/api/playlists' && req.method === 'GET') {
    const playlists = db.getPlaylists();
    return Response.json({ success: true, playlists });
  }

  if (pathname === '/api/playlists' && req.method === 'POST') {
    const body = (await req.json()) as { name?: string; description?: string };
    if (!body.name) {
      return Response.json({ success: false, error: 'name is required' }, { status: 400 });
    }
    const playlist = db.createPlaylist(body.name, body.description);
    return Response.json({ success: true, playlist });
  }

  if (pathname.startsWith('/api/playlists/') && req.method === 'GET') {
    const id = pathname.replace('/api/playlists/', '');
    const data = db.getPlaylist(id);
    if (!data) return Response.json({ success: false, error: 'Not found' }, { status: 404 });
    return Response.json({ success: true, ...data });
  }

  if (pathname === '/api/history' && req.method === 'GET') {
    const history = db.getPlaybackHistory(50);
    return Response.json({ success: true, history });
  }

  if (pathname === '/api/resume' && req.method === 'POST') {
    const body = (await req.json()) as { mediaId: string; uri: string; title: string; position: number; duration: number };
    db.saveResumePosition(body.mediaId, body.uri, body.title, body.position, body.duration);
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Endpoint not found' }, { status: 404 });
}

async function handleStream(req: Request, filePath: string): Promise<Response> {
  const fullPath = resolve(filePath);
  const file = Bun.file(fullPath);

  if (!(await file.exists())) {
    return new Response('File Not Found', { status: 404 });
  }

  const fileSize = file.size;
  const rangeHeader = req.headers.get('range');

  if (!rangeHeader) {
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': file.type || 'video/mp4',
        'Content-Length': fileSize.toString(),
        'Accept-Ranges': 'bytes',
      },
    });
  }

  // Parse HTTP Range: bytes=start-end
  const parts = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

  if (start >= fileSize || end >= fileSize || start > end) {
    return new Response('Requested range not satisfiable', {
      status: 416,
      headers: { 'Content-Range': `bytes */${fileSize}` },
    });
  }

  const chunkSize = end - start + 1;
  const slicedFile = file.slice(start, end + 1);

  return new Response(slicedFile, {
    status: 206,
    headers: {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize.toString(),
      'Content-Type': file.type || 'video/mp4',
    },
  });
}
