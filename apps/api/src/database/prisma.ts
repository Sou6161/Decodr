import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env.js';
import { logger } from '../utils/logger.js';

/**
 * Single shared PrismaClient. In development the module may be re-evaluated on
 * hot reload, so we cache the instance on globalThis to avoid exhausting the
 * connection pool.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['warn', 'error'] : ['warn', 'error'],
  });

if (!isProd) globalForPrisma.prisma = prisma;

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
  logger.info('Database connected');
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  logger.info('Database disconnected');
}
