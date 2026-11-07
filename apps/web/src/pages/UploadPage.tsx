import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Dropzone } from '@/features/upload/Dropzone';
import { useUploadRepository } from '@/features/upload/hooks';
import type { UploadSelection } from '@/features/upload/collectFiles';
import { ApiClientError } from '@/services/apiClient';
import { toast } from '@/stores/toastStore';

const STEPS = [
  { title: 'Scan', description: 'Source files are read and indexed.', color: 'var(--color-line-teal)' },
  { title: 'Map', description: 'Components and relationships are modeled.', color: 'var(--color-line-orange)' },
  { title: 'Explain', description: 'Ask how any feature works.', color: 'var(--color-line-pink)' },
];

export function UploadPage() {
  const navigate = useNavigate();
  const upload = useUploadRepository();

  const handleSelect = (selection: UploadSelection) => {
    upload.mutate(selection, {
      onSuccess: ({ repository }) => {
        toast.success('Upload received', `Analyzing "${repository.name}"…`);
        navigate(`/repositories/${repository.id}`);
      },
    });
  };

  const errorMessage =
    upload.error instanceof ApiClientError
      ? upload.error.apiError.message
      : upload.error
        ? 'Upload failed. Please try again.'
        : null;

  return (
    <div>
      <PageHeader
        title="Upload project"
        description="Pick a project folder. Decodr reads only the source files and maps how they fit together."
      />

      <Dropzone
        onSelect={handleSelect}
        isUploading={upload.isPending}
        error={errorMessage}
      />

      {/* What happens next, as the three stops the upload travels through. */}
      <div className="mt-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-subtle">After you upload</p>
        <ol className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3 sm:gap-0">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative flex gap-4 sm:block">
              <div className="relative flex items-center sm:h-6">
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute left-6 right-0 top-1/2 hidden h-[7px] -translate-y-1/2 sm:block"
                    style={{ background: STEPS[i + 1]!.color }}
                  />
                )}
                <span
                  className="relative z-10 h-6 w-6 shrink-0 rounded-full border-[4px] bg-surface"
                  style={{ borderColor: step.color }}
                />
              </div>
              <div className="sm:mt-4 sm:pr-6">
                <h3 className="font-display text-lg font-bold text-foreground">{step.title}</h3>
                <p className="mt-1 text-sm text-muted">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
