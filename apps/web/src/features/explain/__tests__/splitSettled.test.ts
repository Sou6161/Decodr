import { describe, expect, it } from 'vitest';
import { splitSettled } from '../Markdown';

describe('splitSettled', () => {
  it('keeps everything in the tail until a block has finished', () => {
    expect(splitSettled('Hello wor')).toEqual({ settled: '', tail: 'Hello wor' });
  });

  it('settles finished paragraphs before the last blank line', () => {
    const { settled, tail } = splitSettled('One.\n\nTwo.\n\nThr');
    expect(settled + tail).toBe('One.\n\nTwo.\n\nThr');
    expect(tail.trim()).toBe('Thr');
  });

  it('never splits inside an open code fence', () => {
    const md = 'Intro.\n\n```ts\nconst a = 1;\n\nconst b = 2;';
    const { settled, tail } = splitSettled(md);
    expect(settled).toBe('Intro.\n');
    expect(tail).toContain('```ts');
    expect(tail).toContain('const b = 2;');
  });

  it('settles a closed fence', () => {
    const md = '```ts\nx\n```\n\nAfter';
    expect(splitSettled(md).tail.trim()).toBe('After');
  });
});
