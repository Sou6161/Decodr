import { lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { RepositoryLayout } from '@/layouts/RepositoryLayout';
import { RepositoriesPage } from '@/pages/RepositoriesPage';
import { UploadPage } from '@/pages/UploadPage';
import { DashboardPage } from '@/pages/repository/DashboardPage';
import { ExplainPage } from '@/pages/repository/ExplainPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

// Code-split the graph view — React Flow + dagre are heavy and only needed here.
const GraphPage = lazy(() =>
  import('@/pages/repository/GraphPage').then((m) => ({ default: m.GraphPage })),
);

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <RepositoriesPage /> },
      { path: '/upload', element: <UploadPage /> },
      {
        path: '/repositories/:id',
        element: <RepositoryLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'graph', element: <GraphPage /> },
          { path: 'explain', element: <ExplainPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
