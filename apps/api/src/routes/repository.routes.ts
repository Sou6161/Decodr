import { Router } from 'express';
import { repositoryController } from '../controllers/repositoryController.js';
import { conversationController } from '../controllers/conversationController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { uploadZip, uploadFolder } from '../middleware/upload.js';

/**
 * /api/repositories
 *
 * The full contract is declared here. Handlers for later phases throw a
 * 501 until implemented, keeping the surface visible and stable.
 */
export const repositoryRouter: Router = Router();

repositoryRouter.get('/', asyncHandler(repositoryController.list));
repositoryRouter.post('/', uploadZip, asyncHandler(repositoryController.upload));
repositoryRouter.post('/folder', uploadFolder, asyncHandler(repositoryController.uploadFolder));

repositoryRouter.get('/:id', asyncHandler(repositoryController.detail));
repositoryRouter.delete('/:id', asyncHandler(repositoryController.remove));
repositoryRouter.get('/:id/progress', asyncHandler(repositoryController.progress));
repositoryRouter.get('/:id/components', asyncHandler(repositoryController.entities));
repositoryRouter.get('/:id/graph', asyncHandler(repositoryController.graph));
repositoryRouter.get('/:id/dashboard', asyncHandler(repositoryController.dashboard));

// Persistent explanation conversations
repositoryRouter.get('/:id/conversations', asyncHandler(conversationController.list));
repositoryRouter.post('/:id/conversations/ask', asyncHandler(conversationController.ask));
repositoryRouter.get('/:id/conversations/:cid', asyncHandler(conversationController.detail));
repositoryRouter.delete('/:id/conversations/:cid', asyncHandler(conversationController.remove));
