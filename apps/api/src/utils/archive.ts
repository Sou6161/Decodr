import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import unzipper from 'unzipper';
import { AppError } from './AppError.js';
import { isIgnoredDirectory, isSourceFile } from './sourceFiles.js';

/** Hard cap on entries to defend against zip bombs. */
const MAX_ENTRIES = 20_000;

/**
 * Most bytes one source file may expand to. Matches the folder-upload cap; a
 * "source file" bigger than this is a bundle or generated blob, never worth
 * parsing.
 */
const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

/**
 * Most bytes a whole archive may expand to. Capping the entry COUNT alone let
 * a small archive of a few enormous entries (the classic zip bomb: kilobytes
 * compressed, gigabytes inflated) fill the disk.
 */
const MAX_EXTRACTED_BYTES = 512 * 1024 * 1024;

/**
 * Counts bytes as they stream and aborts past a limit. The sizes in a ZIP's
 * headers are written by whoever made the archive and can lie, so the real
 * output is what gets measured.
 */
function byteLimiter(limit: number, overTotal: (n: number) => boolean): Transform {
  let seen = 0;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      seen += chunk.length;
      if (seen > limit) {
        cb(AppError.unprocessable('An archive entry is larger than allowed.'));
        return;
      }
      if (overTotal(chunk.length)) {
        cb(AppError.unprocessable('Archive expands to more source than allowed.'));
        return;
      }
      cb(null, chunk);
    },
  });
}

/**
 * Extracts a ZIP file from disk into `destDir`.
 *
 * Hardened against:
 *  - Zip-slip: entries resolving outside destDir are rejected.
 *  - Zip bombs: entry count is capped, and so are the bytes each entry and the
 *    whole archive inflate to — declared sizes are checked up front and the
 *    actual output is measured while streaming.
 *  - Junk: ignored directories (node_modules, .git, …) and files the scanner
 *    would discard anyway (images, fonts, binaries) are never written.
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

  const wanted = directory.files.filter((entry) => {
    if (entry.type !== 'File') return false;
    const normalized = entry.path.replace(/\\/g, '/');
    return !pathHasIgnoredSegment(normalized) && isSourceFile(normalized);
  });

  // Cheap first line of defence: the sizes the archive declares.
  const declared = wanted.reduce((sum, e) => sum + Math.min(e.uncompressedSize, MAX_ENTRY_BYTES), 0);
  if (declared > MAX_EXTRACTED_BYTES) {
    throw AppError.unprocessable('Archive expands to more source than allowed.');
  }

  let total = 0;
  let written = 0;
  for (const entry of wanted) {
    const normalized = entry.path.replace(/\\/g, '/');
    // Oversized generated files are skipped, not fatal — the rest of the
    // project is still worth analysing.
    if (entry.uncompressedSize > MAX_ENTRY_BYTES) continue;

    const target = path.resolve(destDir, normalized);
    // Zip-slip guard: the resolved path must stay within destDir.
    if (target !== destDir && !target.startsWith(destDir + path.sep)) {
      throw AppError.unprocessable(`Unsafe archive entry path: ${entry.path}`);
    }

    await mkdir(path.dirname(target), { recursive: true });
    await pipeline(
      entry.stream(),
      byteLimiter(MAX_ENTRY_BYTES, (n) => {
        total += n;
        return total > MAX_EXTRACTED_BYTES;
      }),
      createWriteStream(target),
    );
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
