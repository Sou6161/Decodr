import { Router } from 'express';
import { healthController } from '../controllers/healthController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { repositoryRouter } from './repository.routes.js';

/** Root API router mounted at /api. */
export const apiRouter: Router = Router();

// Ultra-light liveness probe (no DB) — used by an external keep-alive pinger to
// stop Render's free instance from spinning down, without waking Neon.
apiRouter.get('/ping', (_req, res) => {
  res.json({ status: 'ok' });
});

apiRouter.get('/health', asyncHandler(healthController));
apiRouter.use('/repositories', repositoryRouter);
