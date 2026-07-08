import type { Repository as RepositoryModel } from '@prisma/client';
import type { Repository } from '@decodr/types';

/** Maps a Prisma Repository row to the client-facing Repository DTO. */
export function toRepositoryDto(model: RepositoryModel): Repository {
  return {
    id: model.id,
    name: model.name,
    status: model.status,
    error: model.error,
    fileCount: model.fileCount,
    componentCount: model.componentCount,
    hookCount: model.hookCount,
    routeCount: model.routeCount,
    createdAt: model.createdAt.toISOString(),
    updatedAt: model.updatedAt.toISOString(),
  };
}
