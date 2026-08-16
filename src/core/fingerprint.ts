export interface FingerprintSource {
  size: number;
  duration?: number;
  readHeaderBytes: (length: number) => Promise<Uint8Array>;
}

export function quickHash64(bytes: Uint8Array): string {
  // 64-bit FNV-1a / Murmur-style fast rolling hash
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    h1 = Math.imul(h1 ^ byte, 0x01000193);
    h2 = Math.imul(h2 ^ (byte + (i % 255)), 0x5bd1e995);
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`;
}

export async function computeMediaFingerprint(
  source: File | Blob | string | { size: number; duration?: number; buffer?: Uint8Array }
): Promise<string> {
  const HEADER_SIZE = 64 * 1024; // 64KB

  // 1. File or Blob object in Browser
  if (typeof Blob !== 'undefined' && source instanceof Blob) {
    const size = source.size;
    const slice = source.slice(0, Math.min(size, HEADER_SIZE));
    const arrayBuffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const hash = quickHash64(bytes);
    return `fp_${size}_${hash}`;
  }

  // 2. Buffer or In-memory object
  if (typeof source === 'object' && 'buffer' in source && source.buffer) {
    const size = source.size || source.buffer.byteLength;
    const slice = source.buffer.slice(0, Math.min(size, HEADER_SIZE));
    const hash = quickHash64(slice);
    return `fp_${size}_${hash}`;
  }

  // 3. Local file path (Bun / Node environment)
  if (typeof source === 'string') {
    try {
      if (typeof Bun !== 'undefined' && Bun.file) {
        const file = Bun.file(source);
        if (await file.exists()) {
          const size = file.size;
          const slice = file.slice(0, Math.min(size, HEADER_SIZE));
          const arrayBuffer = await slice.arrayBuffer();
          const bytes = new Uint8Array(arrayBuffer);
          const hash = quickHash64(bytes);
          return `fp_${size}_${hash}`;
        }
      }
    } catch {
      // Fallback
    }

    // String URI fallback hash
    const strBytes = new TextEncoder().encode(source);
    return `uri_${quickHash64(strBytes)}`;
  }

  // Generic fallback
  return `fp_gen_${Date.now()}`;
}
