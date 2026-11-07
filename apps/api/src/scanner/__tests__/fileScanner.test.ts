import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { looksBinary, scanRepository } from '../fileScanner.js';
import { storableText } from '../../utils/storableText.js';

let dir: string | undefined;

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
  dir = undefined;
});

describe('looksBinary', () => {
  it('flags a NUL near the start', () => {
    expect(looksBinary('ab\u0000cd')).toBe(true);
  });

  it('leaves ordinary source alone', () => {
    expect(looksBinary('export const a = 1;\n')).toBe(false);
  });

  it('ignores a NUL that only appears far into the file', () => {
    expect(looksBinary('x'.repeat(9000) + '\u0000')).toBe(false);
  });
});

describe('scanRepository', () => {
  it('skips binary files that carry a source extension', async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'decodr-scan-'));
    await writeFile(path.join(dir, 'App.tsx'), 'export function App() { return null; }\n');
    await writeFile(path.join(dir, 'blob.js'), Buffer.from([0x00, 0x01, 0x02, 0x41]));

    const { files } = await scanRepository(dir);
    expect(files.map((f) => f.relativePath)).toEqual(['App.tsx']);
  });
});

describe('storableText', () => {
  it('replaces NUL so Postgres accepts the text', () => {
    expect(storableText('a\u0000b')).toBe('a�b');
  });

  it('returns text without NUL unchanged', () => {
    const text = 'const x = "ok";';
    expect(storableText(text)).toBe(text);
  });
});
