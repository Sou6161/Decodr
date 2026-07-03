import { Router } from 'express';
import { repositoryController } from '../controllers/repositoryController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadZip } from '../middleware/upload.js';

/**
 * /api/repositories
 *
 * The full contract is declared here. Handlers for later phases throw a
 * 501 until implemented, keeping the surface visible and stable.
 */
export const repositoryRouter: Router = Router();

repositoryRouter.get('/', asyncHandler(repositoryController.list));
repositoryRouter.post('/', uploadZip, asyncHandler(repositoryController.upload));

repositoryRouter.get('/:id', asyncHandler(repositoryController.detail));
repositoryRouter.get('/:id/progress', asyncHandler(repositoryController.progress));
repositoryRouter.get('/:id/components', asyncHandler(repositoryController.entities));
repositoryRouter.get('/:id/graph', asyncHandler(repositoryController.graph));
repositoryRouter.get('/:id/dashboard', asyncHandler(repositoryController.dashboard));
repositoryRouter.post('/:id/explain', asyncHandler(repositoryController.explain));
