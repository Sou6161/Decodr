import type { Request, Response } from 'express';
import type {
  ListRepositoriesResponse,
  RepositoryDashboardResponse,
  RepositoryDetailResponse,
  RepositoryGraphResponse,
  RepositoryProgressResponse,
  UploadRepositoryResponse,
} from '@arcloom/types';
import { repositoryService } from '../services/repositoryService.js';
import { uploadService } from '../services/uploadService.js';
import { getRepositoryGraph } from '../services/graphService.js';
import { getDashboard } from '../services/dashboardService.js';
import { AppError } from '../utils/AppError.js';

/** Thin HTTP layer: parse input, call a service, shape the response. */
export const repositoryController = {
  async list(req: Request, res: Response): Promise<void> {
    const repositories = await repositoryService.list(req.ownerToken);
    const body: ListRepositoriesResponse = { repositories };
    res.json(body);
  },

  async detail(req: Request, res: Response): Promise<void> {
    const repository = await repositoryService.getById(requireId(req));
    const body: RepositoryDetailResponse = { repository };
    res.json(body);
  },

  async remove(req: Request, res: Response): Promise<void> {
    await repositoryService.remove(requireId(req));
    res.status(204).send();
  },

  async progress(req: Request, res: Response): Promise<void> {
    const progress = await repositoryService.getProgress(requireId(req));
    const body: RepositoryProgressResponse = { progress };
    res.json(body);
  },

  async upload(req: Request, res: Response): Promise<void> {
    if (!req.file) {
      throw AppError.badRequest('Attach a .zip file under the form field "file".');
    }
    const repository = await uploadService.uploadAndProcess(req.file, req.ownerToken);
    const body: UploadRepositoryResponse = { repository };
    res.status(202).json(body);
  },

  async uploadFolder(req: Request, res: Response): Promise<void> {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (files.length === 0) {
      throw AppError.badRequest('No source files were uploaded.');
    }

    let manifest: unknown;
    try {
      manifest = JSON.parse(String(req.body.manifest ?? '[]'));
    } catch {
      throw AppError.badRequest('Invalid upload manifest.');
    }
    if (!Array.isArray(manifest) || manifest.length !== files.length) {
      throw AppError.badRequest('Upload manifest does not match the uploaded files.');
    }

    const staged = files.map((f, i) => ({
      tempPath: f.path,
      relativePath: sanitizeRelative(String(manifest[i])),
    }));

    const repository = await uploadService.uploadFolderAndProcess({
      name: String(req.body.name ?? 'project'),
      files: staged,
      ownerToken: req.ownerToken,
    });
    const body: UploadRepositoryResponse = { repository };
    res.status(202).json(body);
  },

  // ── Endpoints completed in later phases ────────────────────────────────
  // Registered now so the API contract is explicit and stable.

  async graph(req: Request, res: Response): Promise<void> {
    const id = requireId(req);
    await repositoryService.getById(id); // 404 if missing
    const graph = await getRepositoryGraph(id);
    const body: RepositoryGraphResponse = { graph };
    res.json(body);
  },

  async dashboard(req: Request, res: Response): Promise<void> {
    const stats = await getDashboard(requireId(req));
    const body: RepositoryDashboardResponse = { stats };
    res.json(body);
  },

  async entities(req: Request, res: Response): Promise<void> {
    const body = await repositoryService.getEntities(requireId(req));
    res.json(body);
  },
};

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id) throw AppError.badRequest('Missing repository id');
  return id;
}

/** Normalizes a client-supplied relative path and strips any traversal. */
function sanitizeRelative(raw: string): string {
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter((p) => p && p !== '.' && p !== '..');
  return parts.join('/');
}
