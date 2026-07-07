import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import { AppError } from './AppError.js';
import { isIgnoredDirectory } from './sourceFiles.js';

/** Hard cap on entries to defend against zip bombs. */
const MAX_ENTRIES = 20_000;

/**
 * Extracts a ZIP file from disk into `destDir`.
 *
 * Hardened against:
 *  - Zip-slip: entries resolving outside destDir are rejected.
 *  - Zip bombs: entry count is capped.
 *  - Junk: ignored directories (node_modules, .git, …) are skipped on the fly.
 *
 * Reading from a path (rather than a Buffer) keeps large archives off the heap.
 * Returns the number of files written.
 */
export async function extractZipFile(
  zipPath: string,
  destDir: string,
): Promise<number> {
  await mkdir(destDir, { recursive: true });
  const directory = await unzipper.Open.file(zipPath);

  if (directory.files.length > MAX_ENTRIES) {
    throw AppError.unprocessable(
      `Archive has too many entries (${directory.files.length}).`,
    );
  }

  let written = 0;
  for (const entry of directory.files) {
    if (entry.type !== 'File') continue;

    const normalized = entry.path.replace(/\\/g, '/');
    if (pathHasIgnoredSegment(normalized)) continue;

    const target = path.resolve(destDir, normalized);
    // Zip-slip guard: the resolved path must stay within destDir.
    if (target !== destDir && !target.startsWith(destDir + path.sep)) {
      throw AppError.unprocessable(`Unsafe archive entry path: ${entry.path}`);
    }

    await mkdir(path.dirname(target), { recursive: true });
    await pipeline(entry.stream(), createWriteStream(target));
    written += 1;
  }

  if (written === 0) {
    throw AppError.unprocessable('Archive contained no extractable files.');
  }
  return written;
}

/** Best-effort recursive cleanup of an extraction directory. */
export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Best-effort removal of a single file (e.g. a temp upload). */
export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}

function pathHasIgnoredSegment(relativePath: string): boolean {
  return relativePath
    .split('/')
    .some((segment) => isIgnoredDirectory(segment));
}
