import { Router } from 'express';
import { healthController } from '../controllers/healthController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { repositoryRouter } from './repository.routes.js';

/** Root API router mounted at /api. */
export const apiRouter: Router = Router();

apiRouter.get('/health', asyncHandler(healthController));
apiRouter.use('/repositories', repositoryRouter);
