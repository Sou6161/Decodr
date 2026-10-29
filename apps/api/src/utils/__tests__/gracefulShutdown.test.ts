import type { AddressInfo } from 'node:net';
import express from 'express';
import { describe, expect, it } from 'vitest';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { gracefulShutdown } from '../gracefulShutdown.js';

const later = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * A real HTTP server with a route that is still working when the signal lands —
 * the case a deploy hits whenever someone is mid-answer.
 */
function startServer(workMs: number, onSaved?: () => void) {
  const app = express();
  app.get(
    '/slow',
    asyncHandler(async (_req, res) => {
      res.write('started');
      await later(workMs);
      // Stands in for the write a stopped answer makes after its socket closes.
      onSaved?.();
      if (!res.writableEnded && !res.destroyed) res.end(' done');
    }),
  );
  const server = app.listen(0);
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}/slow` };
}

describe('gracefulShutdown', () => {
  it('lets a request that is mid-flight finish before resolving', async () => {
    const { server, url } = startServer(300);
    const response = fetch(url).then((r) => r.text());
    await later(50); // the signal lands while the handler is working

    const result = await gracefulShutdown(server, { drainMs: 5_000, saveMs: 1_000 });

    expect(result.drainedCleanly).toBe(true);
    // The reader got the whole answer, not a connection reset.
    expect(await response).toBe('started done');
  });

  it('refuses new connections once shutdown has started', async () => {
    const { server, url } = startServer(300);
    const first = fetch(url).then((r) => r.text());
    await later(50);
    const shutdown = gracefulShutdown(server, { drainMs: 5_000, saveMs: 1_000 });

    await expect(fetch(url)).rejects.toThrow();
    await first;
    await shutdown;
  });

  it('cuts a request that outlives the window, then waits for it to save', async () => {
    let saved = false;
    const { server, url } = startServer(400, () => {
      saved = true;
    });
    const response = fetch(url).then((r) => r.text()).catch(() => 'cut');
    await later(50);

    const started = Date.now();
    const result = await gracefulShutdown(server, { drainMs: 100, saveMs: 2_000 });

    expect(result.drainedCleanly).toBe(false);
    // The save that follows a cut connection still ran before shutdown returned —
    // which is what lets the database be disconnected safely afterwards.
    expect(saved).toBe(true);
    // Bounded by drain + the handler's remaining work, not by saveMs.
    expect(Date.now() - started).toBeLessThan(1_500);
    await response;
  });
});
