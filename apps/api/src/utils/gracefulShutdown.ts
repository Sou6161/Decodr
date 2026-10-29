import type { Server } from 'node:http';
import { drained, inFlight } from './inflight.js';
import { logger } from './logger.js';

/**
 * Stops an HTTP server without losing the work it is in the middle of.
 *
 * Replaces a shutdown that called `server.close()` without waiting, then
 * disconnected the database and exited in the same tick. Every deploy killed
 * whatever answer was streaming at that moment, mid-sentence, and the code that
 * saves a stopped answer could not run because the database was already gone.
 *
 * Order matters: refuse new work, let running work finish, cut what is still
 * running only once the window closes, and give those handlers a moment to save
 * before the caller tears the database down.
 */
export async function gracefulShutdown(
  server: Server,
  opts: {
    /** How long running requests get to finish on their own. */
    drainMs: number;
    /** After cutting the rest, how long their handlers get to save. */
    saveMs: number;
  },
): Promise<{ drainedCleanly: boolean }> {
  logger.info(`Shutting down — draining ${inFlight()} running request(s)`);

  // Refuse new connections, and drop keep-alive sockets with nothing on them,
  // which would otherwise hold the server open indefinitely.
  server.close();
  server.closeIdleConnections();

  if (await drained(opts.drainMs)) return { drainedCleanly: true };

  logger.warn(`Drain window elapsed with ${inFlight()} request(s) still running — closing them`);
  // Each closed stream aborts its model call and saves what it had written.
  server.closeAllConnections();
  if (!(await drained(opts.saveMs))) {
    logger.warn(`${inFlight()} request(s) did not finish saving before shutdown`);
  }
  return { drainedCleanly: false };
}
