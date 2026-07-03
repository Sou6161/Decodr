import type { Request, Response } from 'express';
import { z } from 'zod';
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
import { explainRepository } from '../services/explanationService.js';
import { AppError } from '../utils/AppError.js';

const ExplainBodySchema = z.object({
  question: z.string().min(3, 'Question is too short').max(500, 'Question is too long'),
});

/** Thin HTTP layer: parse input, call a service, shape the response. */
export const repositoryController = {
  async list(_req: Request, res: Response): Promise<void> {
    const repositories = await repositoryService.list();
    const body: ListRepositoriesResponse = { repositories };
    res.json(body);
  },

  async detail(req: Request, res: Response): Promise<void> {
    const repository = await repositoryService.getById(requireId(req));
    const body: RepositoryDetailResponse = { repository };
    res.json(body);
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
    const repository = await uploadService.uploadAndProcess(req.file);
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

  async explain(req: Request, res: Response): Promise<void> {
    const id = requireId(req);
    const { question } = ExplainBodySchema.parse(req.body);
    const body = await explainRepository(id, question);
    res.json(body);
  },
};

function requireId(req: Request): string {
  const id = req.params.id;
  if (!id) throw AppError.badRequest('Missing repository id');
  return id;
}
