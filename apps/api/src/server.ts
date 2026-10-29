import { createApp } from './app.js';
import { port } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './database/prisma.js';
import { logger } from './utils/logger.js';
import { startRetentionSweep } from './services/retentionService.js';
import { gracefulShutdown } from './utils/gracefulShutdown.js';

/**
 * How long running requests get to finish on their own after a shutdown signal.
 *
 * An answer can stream for a minute, so this cannot wait for everything — the
 * platform kills the process after its own deadline (30 seconds on Render by
 * default). Drain for most of that window, then cut what is left.
 */
const DRAIN_MS = 20_000;
/**
 * After cutting the remaining connections, how long their handlers get to save.
 * Closing a stream's socket aborts the model call, and the handler then writes
 * the partial answer — which needs the database still connected.
 */
const SAVE_MS = 5_000;

async function main(): Promise<void> {
  await connectDatabase();

  // Uploads are deleted automatically after the retention window.
  startRetentionSweep();

  const app = createApp();
  // Bind to 0.0.0.0 so hosting platforms (Render) can route to the service.
  const server = app.listen(port, '0.0.0.0', () => {
    logger.info(`Decodr API listening on port ${port}`);
  });

  // A second signal (Render escalates, or a double Ctrl-C) must not start a
  // second drain on top of the first.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received`);
    await gracefulShutdown(server, { drainMs: DRAIN_MS, saveMs: SAVE_MS });
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
