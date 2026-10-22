import { describe, expect, it } from 'vitest';
import { fallbackTitle, isUsableTitle } from '../titler.js';

describe('isUsableTitle', () => {
  it('accepts a title that names a subject', () => {
    for (const t of [
      'Auth flow',
      'Dashboard data fetching',
      'useMemo vs useCallback',
      'Sync catalog job',
    ]) {
      expect(isUsableTitle(t), t).toBe(true);
    }
  });

  it('rejects a title that narrates the message', () => {
    // This is the shape that reached the sidebar: the model reported what
    // happened instead of naming the topic.
    for (const t of [
      'The user said "hi man"',
      'User asks about routing',
      'They want an explanation',
      'A greeting message',
      'This conversation about auth',
      'Asking about the dashboard',
    ]) {
      expect(isUsableTitle(t), t).toBe(false);
    }
  });

  it('rejects a single word, which is never a useful label', () => {
    expect(isUsableTitle('Code')).toBe(false);
    expect(isUsableTitle('')).toBe(false);
  });
});

describe('fallbackTitle', () => {
  it('uses the first line, which is what a greeting should be labelled with', () => {
    expect(fallbackTitle('hi man')).toBe('hi man');
    expect(fallbackTitle('explain routing\nand the layouts')).toBe('explain routing');
  });

  it('truncates a long opening line', () => {
    expect(fallbackTitle('x'.repeat(100))).toHaveLength(71);
  });
});
