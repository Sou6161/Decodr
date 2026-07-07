import { useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui';
import { GraphIcon, SearchIcon, SparkIcon } from '@/components/icons';
import { Dropzone } from '@/features/upload/Dropzone';
import { useUploadRepository } from '@/features/upload/hooks';
import type { UploadSelection } from '@/features/upload/collectFiles';
import { ApiClientError } from '@/services/apiClient';
import { toast } from '@/stores/toastStore';

const STEPS = [
  { icon: <SearchIcon />, title: 'Scan', description: 'Source files are read and indexed.' },
  { icon: <GraphIcon />, title: 'Map', description: 'Components and relationships are modeled.' },
  { icon: <SparkIcon />, title: 'Explain', description: 'Ask how any feature works.' },
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
        description="Pick a project folder — Arcloom reads only the source files and maps its structure."
      />

      <Dropzone
        onSelect={handleSelect}
        isUploading={upload.isPending}
        error={errorMessage}
      />

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Card key={step.title} className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
                {step.icon}
              </div>
              <span className="text-xs font-medium text-subtle">Step {i + 1}</span>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">{step.title}</h3>
            <p className="mt-1 text-sm text-muted">{step.description}</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
