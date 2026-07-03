import { useCallback, useRef, useState, type DragEvent } from 'react';
import { cn } from '@/utils/cn';
import { UploadIcon } from '@/components/icons';
import { Spinner } from '@/components/ui';

interface DropzoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
  isUploading?: boolean;
  error?: string | null;
}

const MAX_MB = 50;

/** Hand-built drag-and-drop ZIP picker. No third-party dropzone library. */
export function Dropzone({ onFile, disabled, isUploading, error }: DropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const validateAndEmit = useCallback(
    (file: File | undefined) => {
      setLocalError(null);
      if (!file) return;
      if (!file.name.toLowerCase().endsWith('.zip')) {
        setLocalError('Only .zip files are supported.');
        return;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setLocalError(`File too large. Maximum size is ${MAX_MB} MB.`);
        return;
      }
      onFile(file);
    },
    [onFile],
  );

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled || isUploading) return;
    validateAndEmit(e.dataTransfer.files?.[0]);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!disabled && !isUploading) setDragging(true);
  };

  const shownError = localError ?? error;

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled || isUploading}
        onClick={() => !isUploading && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !isUploading) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-20 text-center transition-all duration-200',
          'outline-none focus-visible:ring-2 focus-visible:ring-primary/60',
          dragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-border-strong hover:bg-surface-raised/40',
          (disabled || isUploading) && 'pointer-events-none opacity-70',
        )}
      >
        <div
          className={cn(
            'mb-5 flex h-16 w-16 items-center justify-center rounded-2xl transition-colors',
            dragging ? 'bg-primary/20 text-primary' : 'bg-surface-raised text-subtle',
          )}
        >
          {isUploading ? <Spinner className="h-6 w-6" /> : <UploadIcon width={28} height={28} />}
        </div>

        <h3 className="text-base font-semibold text-foreground">
          {isUploading ? 'Uploading…' : dragging ? 'Drop to upload' : 'Drop your ZIP here'}
        </h3>
        <p className="mt-1.5 max-w-md text-sm text-muted">
          {isUploading
            ? 'Sending your project to Arcloom.'
            : 'Drag and drop, or click to browse. React + TypeScript projects only · max 50 MB.'}
        </p>

        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={(e) => validateAndEmit(e.target.files?.[0] ?? undefined)}
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
