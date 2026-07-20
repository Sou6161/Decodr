/**
 * Client-side collection of a project's source files from a folder picker or a
 * drag-and-drop. Directories like node_modules/.git/build are skipped and only
 * source files are kept — so nothing heavy ever leaves the browser.
 */

export interface PickedFile {
  file: File;
  /** Path relative to (and including) the dropped folder, e.g. "app/src/App.tsx". */
  path: string;
}

export type UploadSelection =
  | { kind: 'zip'; file: File }
  | { kind: 'folder'; files: PickedFile[]; name: string };

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'out', '.next', '.nuxt',
  '.turbo', '.cache', 'coverage', '.vercel', '.idea', '.vscode', '__pycache__',
  '.expo', 'android', 'ios', '.gradle', 'Pods', '.dart_tool',
  // Decodr's own runtime dirs (so analyzing Decodr doesn't scan uploaded repos).
  'storage', '_uploads',
]);

const SOURCE_EXT = /\.(tsx?|jsx?|mjs|cjs)$/i;
/**
 * Manifests answer "what does this project use?" — dependencies, scripts, env
 * keys. Only the `.example` env variants, never a real `.env`, so nobody's
 * secrets leave the browser.
 */
const MANIFEST_RE = /(^|\/)(package\.json|\.env\.example|\.env\.sample)$/i;
const MAX_FILE_BYTES = 2 * 1024 * 1024; // skip minified/generated blobs
const MAX_FILES = 8000;

function hasIgnoredSegment(path: string): boolean {
  return path.split('/').some((seg) => IGNORED_DIRS.has(seg));
}

/** Keeps only reasonable source files. */
export function filterSourceFiles(files: PickedFile[]): PickedFile[] {
  return files
    .filter(
      (f) =>
        (SOURCE_EXT.test(f.path) || MANIFEST_RE.test(f.path)) &&
        !hasIgnoredSegment(f.path) &&
        f.file.size <= MAX_FILE_BYTES,
    )
    .slice(0, MAX_FILES);
}

/** Root folder name from a set of relative paths (first path segment). */
export function rootName(files: PickedFile[]): string {
  const first = files[0]?.path.split('/')[0];
  return first && first.length > 0 ? first : 'project';
}

/** Collects files chosen via an <input webkitdirectory> picker. */
export function collectFromInput(fileList: FileList): PickedFile[] {
  return Array.from(fileList).map((file) => ({
    file,
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

// ── Drag-and-drop directory traversal (webkitGetAsEntry) ───────────────────

interface FsReader {
  readEntries: (cb: (e: FsEntry[]) => void, err: (e: unknown) => void) => void;
}
interface FsEntry {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => FsReader;
}

function readAllEntries(reader: FsReader): Promise<FsEntry[]> {
  const out: FsEntry[] = [];
  return new Promise((resolve, reject) => {
    const step = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(out);
        else {
          out.push(...batch);
          step();
        }
      }, reject);
    };
    step();
  });
}

async function walkEntry(entry: FsEntry, prefix: string, out: PickedFile[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej));
    out.push({ file, path: prefix + entry.name });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    if (IGNORED_DIRS.has(entry.name)) return;
    const entries = await readAllEntries(entry.createReader());
    for (const child of entries) {
      await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}

/** Resolves a drag-drop into a zip file or a folder's source files. */
export async function collectFromDataTransfer(
  dt: DataTransfer,
): Promise<UploadSelection | null> {
  const items = Array.from(dt.items).filter((i) => i.kind === 'file');
  const entries: FsEntry[] = items
    .map((i) => i.webkitGetAsEntry())
    .filter((e): e is FileSystemEntry => e !== null)
    .map((e) => e as unknown as FsEntry);

  // Single .zip dropped.
  if (entries.length === 1 && entries[0]!.isFile) {
    const file = dt.files[0];
    if (file && file.name.toLowerCase().endsWith('.zip')) return { kind: 'zip', file };
  }

  if (entries.length > 0) {
    const collected: PickedFile[] = [];
    for (const entry of entries) await walkEntry(entry, '', collected);
    const files = filterSourceFiles(collected);
    if (files.length > 0) return { kind: 'folder', files, name: rootName(files) };
    return { kind: 'folder', files: [], name: rootName(collected) };
  }

  // Fallback: a plain file (e.g. a zip) with no entry API.
  const file = dt.files[0];
  if (file && file.name.toLowerCase().endsWith('.zip')) return { kind: 'zip', file };
  return null;
}
