import { startCimoServer } from './server';
import { resolve } from 'path';

function printBanner(port: number, host: string) {
  console.log(`
  \x1b[35m╔══════════════════════════════════════════════════════════════╗
  ║                                                              ║
  ║   \x1b[1m\x1b[37m  ██████╗██╗███╗   ███╗ ██████╗ \x1b[0m\x1b[35m                                ║
  ║   \x1b[1m\x1b[37m ██╔════╝██║████╗ ████║██╔═══██╗\x1b[0m\x1b[35m    Minimalist Cross-Platform  ║
  ║   \x1b[1m\x1b[37m ██║     ██║██╔████╔██║██║   ██║\x1b[0m\x1b[35m    Media Player               ║
  ║   \x1b[1m\x1b[37m ██║     ██║██║╚██╔╝██║██║   ██║\x1b[0m\x1b[35m                                ║
  ║   \x1b[1m\x1b[37m ╚██████╗██║██║ ╚═╝ ██║╚██████╔╝\x1b[0m\x1b[35m                                ║
  ║   \x1b[1m\x1b[37m  ╚═════╝╚═╝╚═╝     ╚═╝ ╚═════╝ \x1b[0m\x1b[35m                                ║
  ║                                                              ║
  ║   \x1b[32m▶ Application running at: \x1b[1m\x1b[36mhttp://${host}:${port}\x1b[0m\x1b[35m                    ║
  ║   \x1b[33m⚡ Zero-Copy GPU Hardware Acceleration & 200% Volume Boost\x1b[0m\x1b[35m ║
  ║   \x1b[34m🎵 MPRIS2 / MediaSession / SQLite Library Ready\x1b[0m\x1b[35m            ║
  ╚══════════════════════════════════════════════════════════════╝\x1b[0m
`);
}

async function main() {
  const args = process.argv.slice(2);
  let port = 3000;
  let host = '127.0.0.1';
  let dbPath = 'cimo.db';
  let scanDir: string | null = null;
  const initialFiles: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      port = parseInt(args[++i], 10) || 3000;
    } else if (arg === '--host') {
      host = args[++i] || '127.0.0.1';
    } else if (arg === '--db') {
      dbPath = args[++i];
    } else if (arg === '--scan') {
      scanDir = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Usage: cimo [options] [files...]

Options:
  -p, --port <number>    Server port (default: 3000)
  --host <string>        Server hostname (default: 127.0.0.1)
  --db <path>            Database SQLite file path (default: cimo.db)
  --scan <directory>     Auto-scan directory for media on start
  -h, --help             Show help message
`);
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      initialFiles.push(resolve(arg));
    }
  }

  const { server, db, scanner } = startCimoServer({ port, host, dbPath });
  printBanner(port, host);

  if (scanDir) {
    console.log(`\x1b[34m[Scanner]\x1b[0m Scanning directory: ${scanDir}...`);
    const count = await scanner.scanDirectory(scanDir);
    console.log(`\x1b[32m[Scanner]\x1b[0m Ingested ${count} media items into library.`);
  }

  if (initialFiles.length > 0) {
    for (const filePath of initialFiles) {
      db.saveMediaItem({
        uri: `/stream/${encodeURIComponent(filePath)}`,
        path: filePath,
        title: filePath.split('/').pop() || 'Media File',
      });
    }
    console.log(`\x1b[32m[Playback]\x1b[0m Loaded ${initialFiles.length} file(s) into queue.`);
  }
}

if (import.meta.main) {
  main();
}
