import type { Repository, RepositoryProgress } from './repository.js';
import type {
  ComponentNode,
  FileNode,
  HookNode,
  RouteNode,
} from './analysis.js';
import type { RepositoryGraph } from './graph.js';
import type { DashboardStats } from './dashboard.js';

/** POST /api/repositories (multipart) → created repository. */
export interface UploadRepositoryResponse {
  repository: Repository;
}

/** GET /api/repositories → list. */
export interface ListRepositoriesResponse {
  repositories: Repository[];
}

/** GET /api/repositories/:id → detail summary. */
export interface RepositoryDetailResponse {
  repository: Repository;
}

/** GET /api/repositories/:id/progress → live processing status. */
export interface RepositoryProgressResponse {
  progress: RepositoryProgress;
}

/** GET /api/repositories/:id/graph → relationship graph. */
export interface RepositoryGraphResponse {
  graph: RepositoryGraph;
}

/** GET /api/repositories/:id/dashboard → aggregate insights. */
export interface RepositoryDashboardResponse {
  stats: DashboardStats;
}

/** GET /api/repositories/:id/components → extracted entities. */
export interface RepositoryEntitiesResponse {
  files: FileNode[];
  components: ComponentNode[];
  hooks: HookNode[];
  routes: RouteNode[];
}
