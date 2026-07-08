import type { Request, Response } from 'express';
import { prisma } from '../database/prisma.js';

/** Liveness + readiness probe. Reports DB connectivity. */
export async function healthController(_req: Request, res: Response): Promise<void> {
  let database = 'up';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'down';
  }
  res.json({
    status: database === 'up' ? 'ok' : 'degraded',
    service: 'decodr-api',
    database,
    timestamp: new Date().toISOString(),
  });
}
