import { useCallback, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/utils/cn';
import { FolderIcon, UploadIcon } from '@/components/icons';
import { Spinner } from '@/components/ui';
import {
  collectFromDataTransfer,
  collectFromInput,
  filterSourceFiles,
  rootName,
  type UploadSelection,
} from './collectFiles';

interface DropzoneProps {
  onSelect: (selection: UploadSelection) => void;
  isUploading?: boolean;
  error?: string | null;
}

const MAX_ZIP_MB = Number(import.meta.env.VITE_MAX_UPLOAD_MB ?? 500);

/** Hand-built folder / ZIP picker: pick a folder, drop a folder, or drop a .zip. */
export function Dropzone({ onSelect, isUploading, error }: DropzoneProps) {
  const folderRef = useRef<HTMLInputElement>(null);
  const zipRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const emit = useCallback(
    (selection: UploadSelection | null) => {
      setLocalError(null);
      if (!selection) {
        setLocalError('Drop a project folder or a .zip file.');
        return;
      }
      if (selection.kind === 'folder' && selection.files.length === 0) {
        setLocalError('No source files (.ts, .tsx, .js, .jsx) found in that folder.');
        return;
      }
      if (selection.kind === 'zip' && selection.file.size > MAX_ZIP_MB * 1024 * 1024) {
        setLocalError(`ZIP too large. Maximum size is ${MAX_ZIP_MB} MB.`);
        return;
      }
      onSelect(selection);
    },
    [onSelect],
  );

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (isUploading) return;
    emit(await collectFromDataTransfer(e.dataTransfer));
  };

  const handleFolderInput = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const files = filterSourceFiles(collectFromInput(fileList));
    emit({ kind: 'folder', files, name: rootName(files) });
  };

  const handleZipInput = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.zip')) {
      setLocalError('That file is not a .zip.');
      return;
    }
    emit({ kind: 'zip', file });
  };

  const shownError = localError ?? error;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={isUploading}
        onClick={() => !isUploading && folderRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
            e.preventDefault();
            folderRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isUploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 text-center transition-all duration-200',
          'outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-border-strong hover:bg-surface-raised/40',
          isUploading && 'pointer-events-none opacity-70',
        )}
      >
        <div
          className={cn(
            'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-colors',
            dragging ? 'bg-primary/20 text-primary' : 'bg-surface-raised text-subtle',
          )}
        >
          {isUploading ? <Spinner className="h-6 w-6" /> : <FolderIcon width={28} height={28} />}
        </div>

        <h3 className="text-base font-semibold text-foreground">
          {isUploading ? 'Uploading…' : dragging ? 'Drop to upload' : 'Drop your project folder here'}
        </h3>
        <p className="mt-1.5 max-w-md text-sm text-muted">
          {isUploading
            ? 'Sending your source files to Decodr.'
            : 'Drag a folder, or click to choose one. Only source files are read — node_modules, builds, and .git are skipped automatically.'}
        </p>

        {!isUploading && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              zipRef.current?.click();
            }}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            <UploadIcon width={14} height={14} />
            or upload a .zip instead
          </button>
        )}

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
        <input
          ref={zipRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => handleZipInput(e.target.files?.[0] ?? undefined)}
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
