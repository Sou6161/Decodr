import { describe, expect, it } from 'vitest';
import { afterFinalMarker, finalLines } from '../finalAnswer.js';

describe('finalLines', () => {
  it('reads only the marked lines out of a reply that reasons first', () => {
    // The shape the production model actually produces when it thinks out loud.
    const reply = [
      'The user is asking about the Counter component. This is a question about',
      'React state, so a good title names the component.',
      'FINAL: Counter state management',
    ].join('\n');
    expect(finalLines(reply)).toEqual(['Counter state management']);
  });

  it('collects several marked lines in order, for follow-ups', () => {
    const reply = 'Thinking about what is next.\nFINAL: Where is that cached?\nFINAL: Can the cap change?';
    expect(finalLines(reply)).toEqual(['Where is that cached?', 'Can the cap change?']);
  });

  it('tolerates markdown bold around the marker', () => {
    expect(finalLines('**FINAL:** Auth flow')).toEqual(['Auth flow']);
  });

  it('is empty when the model answered directly without the marker', () => {
    expect(finalLines('Auth flow')).toEqual([]);
  });
});

describe('afterFinalMarker', () => {
  it('keeps a memo that continues onto the lines after the marker', () => {
    const reply = 'Let me think.\nFINAL: Asked about upload flow.\nPrefers code examples.';
    expect(afterFinalMarker(reply)).toBe('Asked about upload flow.\nPrefers code examples.');
  });

  it('uses the LAST marker when reasoning mentions the word earlier', () => {
    const reply = 'I will put the memo after FINAL: below.\nFINAL: Covered routing.';
    expect(afterFinalMarker(reply)).toBe('Covered routing.');
  });

  it('is null with no marker, so the caller decides whether to trust the text', () => {
    expect(afterFinalMarker('Covered routing.')).toBeNull();
  });
});
