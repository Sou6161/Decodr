import { rm } from 'node:fs/promises';

/** Best-effort recursive removal of a directory, e.g. a project's source tree. */
export async function removeDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

/** Best-effort removal of a single file (e.g. a temp upload). */
export async function removeFile(filePath: string): Promise<void> {
  await rm(filePath, { force: true });
}
