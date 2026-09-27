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

/**
 * True if this path is worth uploading. Checked against the path alone so a file
 * can be rejected before a `File` object is ever created for it — in a real
 * project the overwhelming majority of entries are dependencies we discard.
 */
export function isWantedPath(path: string): boolean {
  return (SOURCE_EXT.test(path) || MANIFEST_RE.test(path)) && !hasIgnoredSegment(path);
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

/**
 * Collects files chosen via an <input webkitdirectory> picker.
 *
 * Filters in a single pass instead of building an array of every entry and
 * filtering afterwards: a folder with dependencies installed can contain a
 * hundred thousand files, and allocating an object per entry before throwing
 * 99% of them away is what made large projects feel frozen.
 */
export function collectFromInput(fileList: FileList): PickedFile[] {
  const out: PickedFile[] = [];
  for (let i = 0; i < fileList.length; i += 1) {
    const file = fileList[i];
    if (!file) continue;
    const path =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    if (!isWantedPath(path) || file.size > MAX_FILE_BYTES) continue;
    out.push({ file, path });
    if (out.length >= MAX_FILES) break;
  }
  return out;
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
    const path = prefix + entry.name;
    // Reject on the path first — resolving the File object is the expensive
    // part, and almost every entry in a real project is one we do not want.
    if (!isWantedPath(path)) return;
    const file = await new Promise<File>((res, rej) => entry.file!(res, rej));
    out.push({ file, path });
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

// ── Directory picker (File System Access API) ──────────────────────────────
//
// The `<input webkitdirectory>` picker makes the browser enumerate every file in
// the chosen folder before our code runs. On a project with dependencies
// installed that is >100k entries and takes minutes, and no amount of chunking
// on our side can help because the cost is paid inside the picker.
//
// This API hands us directory handles instead, so we descend ourselves and skip
// ignored directories without ever reading their contents — turning a walk of
// 113k entries into a walk of a few hundred.

interface FsDirHandle {
  kind: 'directory';
  name: string;
  values: () => AsyncIterableIterator<FsDirHandle | FsFileHandle>;
}
interface FsFileHandle {
  kind: 'file';
  name: string;
  getFile: () => Promise<File>;
}

/** True when the browser supports picking a directory handle (Chrome/Edge). */
export function supportsDirectoryPicker(): boolean {
  return typeof (window as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export interface ScanProgress {
  /** Entries looked at so far. */
  seen: number;
  /** Source files kept so far. */
  kept: number;
}

async function walkHandle(
  dir: FsDirHandle,
  prefix: string,
  out: PickedFile[],
  report: (p: ScanProgress) => void,
  counter: { seen: number },
): Promise<void> {
  for await (const entry of dir.values()) {
    if (out.length >= MAX_FILES) return;

    if (entry.kind === 'directory') {
      // The whole point: never descend into dependencies or build output.
      if (IGNORED_DIRS.has(entry.name)) continue;
      await walkHandle(entry, `${prefix}${entry.name}/`, out, report, counter);
      continue;
    }

    counter.seen += 1;
    const path = `${prefix}${entry.name}`;
    if (isWantedPath(path)) {
      const file = await entry.getFile();
      if (file.size <= MAX_FILE_BYTES) out.push({ file, path });
    }
    // Report occasionally so the UI stays live without re-rendering per file.
    if (counter.seen % 200 === 0) report({ seen: counter.seen, kept: out.length });
  }
}

/**
 * Opens the directory picker and collects source files, reporting progress.
 * Returns null if the person cancels the picker.
 */
export async function collectFromDirectoryPicker(
  onProgress: (p: ScanProgress) => void = () => {},
): Promise<UploadSelection | null> {
  const pick = (window as unknown as { showDirectoryPicker: () => Promise<FsDirHandle> })
    .showDirectoryPicker;
  let root: FsDirHandle;
  try {
    root = await pick();
  } catch {
    return null; // cancelled
  }

  const out: PickedFile[] = [];
  const counter = { seen: 0 };
  await walkHandle(root, `${root.name}/`, out, onProgress, counter);
  onProgress({ seen: counter.seen, kept: out.length });

  return { kind: 'folder', files: out, name: root.name };
}
