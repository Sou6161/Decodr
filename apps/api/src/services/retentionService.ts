import path from 'node:path';
import { readdir, stat } from 'node:fs/promises';
import { storageRoot } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { removeDir, removeFile } from '../utils/archive.js';
import { repositoryRepository } from '../repositories/repositoryRepository.js';

/** Where multer lands uploads before the processor moves them into place. */
const UPLOAD_TMP_DIR = '_uploads';

/** Directories under the storage root that are not project folders. */
const NON_PROJECT_DIRS = new Set([UPLOAD_TMP_DIR]);

/**
 * A temp upload older than this belongs to nobody. Processing moves or deletes
 * its temp files within seconds of the request; what is left after an hour was
 * stranded by a rejected request, a crash, or a restart mid-upload.
 */
const TEMP_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;

/**
 * A project still "in progress" with no stage change for this long has lost
 * its worker. Generous on purpose: the slowest stage (parsing plus the write
 * transaction) takes a couple of minutes on a very large project, and during a
 * zero-downtime deploy the OLD instance may still be finishing work — failing
 * a project on boot alone would kill that.
 */
const STALE_PROCESSING_MS = 15 * 60 * 1000;

/**
 * Uploaded projects are deleted automatically after this long.
 *
 * The landing page promises visitors that their code is not kept. This sweep is
 * what makes that true by construction rather than by policy — nobody has to
 * remember to clean up, and an abandoned session cannot leave source code
 * sitting on disk indefinitely.
 */
const RETENTION_HOURS = 48;
/** Every 10 minutes: the stale-job check is only useful if it runs often. */
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

/** Deletes every project older than the retention window. Safe to call anytime. */
export async function purgeExpiredRepositories(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_HOURS * 60 * 60 * 1000);
  const expired = await repositoryRepository.findOlderThan(cutoff);
  if (expired.length === 0) return 0;

  let removed = 0;
  for (const repo of expired) {
    try {
      // Database first: the row is the source of truth, and cascades take the
      // files, components, graph and conversations with it.
      await repositoryRepository.delete(repo.id);
      // Then the extracted source, whether or not the recorded path is usable.
      await removeDir(path.join(storageRoot, repo.id)).catch(() => undefined);
      removed += 1;
    } catch (err) {
      logger.error(
        `Retention sweep could not delete ${repo.id}: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }
  }

  logger.info(`Retention sweep removed ${removed} project(s) older than ${RETENTION_HOURS}h`);
  return removed;
}

/**
 * Deletes storage directories with no matching project row.
 *
 * Rows are removed by cascade when a project is deleted, but a crash between the
 * two steps — or any delete that predates this sweep — can leave the extracted
 * source behind. Without this, orphaned code would sit on disk forever, which is
 * exactly what the retention promise is meant to prevent.
 */
export async function purgeOrphanedDirectories(): Promise<number> {
  let entries: string[];
  try {
    entries = (await readdir(storageRoot, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !NON_PROJECT_DIRS.has(e.name))
      .map((e) => e.name);
  } catch {
    return 0; // storage root not created yet
  }
  if (entries.length === 0) return 0;

  const known = await repositoryRepository.existingIds(entries);

  let removed = 0;
  for (const dir of entries) {
    if (known.has(dir)) continue;
    await removeDir(path.join(storageRoot, dir)).catch(() => undefined);
    removed += 1;
  }
  if (removed > 0) logger.info(`Retention sweep removed ${removed} orphaned director(ies)`);
  return removed;
}

/**
 * Deletes stranded temp uploads.
 *
 * The sweep used to skip `_uploads` entirely, so every upload that never
 * reached the processor — a filter rejection, a manifest mismatch, a crash —
 * left its files there forever. That is source code kept indefinitely, which
 * is exactly what the retention promise says does not happen.
 */
export async function purgeStaleTempUploads(now = Date.now()): Promise<number> {
  const dir = path.join(storageRoot, UPLOAD_TMP_DIR);
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }

  let removed = 0;
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      const info = await stat(file);
      if (!info.isFile() || now - info.mtimeMs < TEMP_UPLOAD_MAX_AGE_MS) continue;
      await removeFile(file);
      removed += 1;
    } catch {
      // Already moved by the processor between readdir and stat — fine.
    }
  }
  if (removed > 0) logger.info(`Retention sweep removed ${removed} stranded temp upload(s)`);
  return removed;
}

/**
 * Fails projects whose processing died with the process that ran it.
 *
 * Processing runs in-process, so a restart mid-analysis used to leave the
 * project on "Analyzing…" until the 48h sweep deleted it. Marking it FAILED
 * with a reason lets the reader see what happened and upload again.
 */
export async function failStaleProcessing(now = Date.now()): Promise<number> {
  const count = await repositoryRepository.failStale(
    new Date(now - STALE_PROCESSING_MS),
    'Processing was interrupted (the server restarted). Upload the project again.',
  );
  if (count > 0) logger.warn(`Marked ${count} interrupted project(s) as failed`);
  return count;
}

/**
 * Starts the periodic sweep, and runs it once at boot. The timer is unref'd so
 * it never holds the process open during shutdown.
 */
export function startRetentionSweep(): NodeJS.Timeout {
  const sweep = async (): Promise<void> => {
    await failStaleProcessing();
    await purgeExpiredRepositories();
    await purgeOrphanedDirectories();
    await purgeStaleTempUploads();
  };

  void sweep().catch((err) => logger.error('Initial retention sweep failed', err));
  const timer = setInterval(() => {
    void sweep().catch((err) => logger.error('Retention sweep failed', err));
  }, SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}
