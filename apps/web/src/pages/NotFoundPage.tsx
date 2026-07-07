import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <p className="text-6xl font-semibold tracking-tight text-primary">404</p>
      <h1 className="mt-4 text-lg font-semibold text-foreground">Page not found</h1>
      <p className="mt-1.5 text-sm text-muted">
        The page you're looking for doesn't exist.
      </p>
      <Button className="mt-6" onClick={() => navigate('/app')}>
        Back to projects
      </Button>
    </div>
  );
}
