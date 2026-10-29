import { describe, expect, it } from 'vitest';
import { drained, inFlight, track } from '../inflight.js';

const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('in-flight tracking', () => {
  it('counts work until it settles, including when it fails', async () => {
    const ok = track(later(20));
    const bad = track(later(20).then(() => Promise.reject(new Error('x'))));
    expect(inFlight()).toBe(2);
    await ok;
    await bad.catch(() => undefined);
    expect(inFlight()).toBe(0);
  });

  it('resolves drained() as soon as the last handler finishes', async () => {
    void track(later(30));
    const started = Date.now();
    expect(await drained(5_000)).toBe(true);
    // Resolved on completion, not by sitting out the whole timeout.
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it('gives up with false when work outlives the window', async () => {
    const slow = track(later(200));
    expect(await drained(20)).toBe(false);
    await slow;
  });

  it('is immediately drained when nothing is running', async () => {
    expect(await drained(1)).toBe(true);
  });
});
