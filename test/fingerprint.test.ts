import { describe, expect, it } from 'bun:test';
import { computeMediaFingerprint, quickHash64 } from '../src/core/fingerprint';

describe('computeMediaFingerprint', () => {
  it('generates consistent deterministic 64-bit quick hash', () => {
    const bytes1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const bytes2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const bytes3 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);

    const hash1 = quickHash64(bytes1);
    const hash2 = quickHash64(bytes2);
    const hash3 = quickHash64(bytes3);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(hash3);
    expect(hash1.length).toBe(16); // 16-hex characters (64-bit)
  });

  it('computes fingerprint from buffer object and file size', async () => {
    const buf = new Uint8Array(1024);
    for (let i = 0; i < buf.length; i++) buf[i] = i % 256;

    const fp = await computeMediaFingerprint({
      size: 1024,
      buffer: buf,
    });

    expect(fp).toStartWith('fp_1024_');
  });

  it('computes fingerprint for string paths or URLs', async () => {
    const fp1 = await computeMediaFingerprint('/path/to/movie1.mp4');
    const fp2 = await computeMediaFingerprint('/path/to/movie1.mp4');
    const fp3 = await computeMediaFingerprint('/path/to/movie2.mp4');

    expect(fp1).toBe(fp2);
    expect(fp1).not.toBe(fp3);
  });
});
