import { useCallback, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/utils/cn';
import { FolderIcon } from '@/components/icons';
import { Spinner } from '@/components/ui';
import {
  collectFromDataTransfer,
  collectFromInput,
  collectFromDirectoryPicker,
  supportsDirectoryPicker,
  rootName,
  type ScanProgress,
  type UploadSelection,
} from './collectFiles';

interface DropzoneProps {
  onSelect: (selection: UploadSelection) => void;
  isUploading?: boolean;
  error?: string | null;
}

/**
 * True on a phone or tablet: a coarse pointer and no hover. Those devices have
 * no drag-and-drop from a file manager and no mouse to "click", so the
 * instructions have to talk about tapping instead.
 *
 * Folder picking needs a current phone browser — Safari on iOS 18.4+, Chrome
 * 132+ or Firefox 142+ on Android. Older phone browsers are not supported.
 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(hover: hover)').matches;
}

/** Hand-built folder picker: pick a project folder, or drop one in. */
export function Dropzone({ onSelect, isUploading, error }: DropzoneProps) {
  const folderRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // Reading a folder is a separate, sometimes slow phase before any upload
  // starts. Showing "Uploading…" through it made a scan look like a stall.
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  // Read once: whether this is a touch device does not change mid-visit.
  const [touch] = useState(isTouchDevice);

  const emit = useCallback(
    (selection: UploadSelection | null) => {
      setLocalError(null);
      if (!selection) {
        setLocalError('Drop a project folder.');
        return;
      }
      if (selection.files.length === 0) {
        setLocalError('No source files (.ts, .tsx, .js, .jsx) found in that folder.');
        return;
      }
      onSelect(selection);
    },
    [onSelect],
  );

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (isUploading || scanning) return;
    setScanning(true);
    try {
      emit(await collectFromDataTransfer(e.dataTransfer));
    } finally {
      setScanning(false);
    }
  };

  const handleFolderInput = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setScanning(true);
    // Yield once so the scanning state paints before the synchronous filter
    // blocks the main thread on a very large folder.
    await new Promise((r) => setTimeout(r, 0));
    try {
      const files = collectFromInput(fileList);
      emit({ kind: 'folder', files, name: rootName(files) });
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  /**
   * Preferred path: walk the directory ourselves so ignored folders are never
   * opened. Falls back to the file input on browsers without the API.
   */
  const pickFolder = async () => {
    if (isUploading || scanning) return;
    if (!supportsDirectoryPicker()) {
      folderRef.current?.click();
      return;
    }
    setScanning(true);
    setProgress({ seen: 0, kept: 0 });
    try {
      const selection = await collectFromDirectoryPicker(setProgress);
      if (selection) emit(selection);
    } finally {
      setScanning(false);
      setProgress(null);
    }
  };

  const shownError = localError ?? error;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={isUploading || scanning}
        onClick={() => void pickFolder()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading && !scanning) {
            e.preventDefault();
            void pickFolder();
          }
        }}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-5 py-12 text-center transition-all duration-200 sm:px-6 sm:py-16',
          'outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-border-strong hover:bg-surface-raised/40',
          (isUploading || scanning) && 'pointer-events-none opacity-70',
        )}
      >
        <div
          className={cn(
            'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-colors',
            dragging ? 'bg-primary/20 text-primary' : 'bg-surface-raised text-subtle',
          )}
        >
          {isUploading || scanning ? (
            <Spinner className="h-6 w-6" />
          ) : (
            <FolderIcon width={28} height={28} />
          )}
        </div>

        <h3 className="text-base font-semibold text-foreground">
          {scanning
            ? 'Reading folder…'
            : isUploading
              ? 'Uploading…'
              : dragging
                ? 'Drop to upload'
                : touch
                  ? 'Choose your project folder'
                  : 'Drop your project folder here'}
        </h3>
        <p className="mt-1.5 max-w-md text-sm text-muted">
          {scanning
            ? progress
              ? `Scanned ${progress.seen.toLocaleString()} files · found ${progress.kept} source file${progress.kept === 1 ? '' : 's'}`
              : 'Looking through the folder for source files…'
            : isUploading
              ? 'Sending your source files to Decodr.'
              : touch
                ? 'Tap to pick the folder from your Files app. Only source files are read. node_modules, builds and .git are left out for you.'
                : 'Drag a folder in, or click to pick one. Only source files are read. node_modules, builds and .git are left out for you.'}
        </p>

        {/* Folder picker: webkitdirectory is set imperatively (not a standard React prop). */}
        <input
          ref={(el) => {
            folderRef.current = el;
            if (el) {
              el.setAttribute('webkitdirectory', '');
              el.setAttribute('directory', '');
            }
          }}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFolderInput(e.target.files)}
        />
      </div>

      {shownError && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {shownError}
        </p>
      )}
    </div>
  );
}
