import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@arcloom/types';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { isProd } from '../config/env.js';

/** Wraps async route handlers so rejected promises reach the error middleware. */
export function asyncHandler<
  T extends RequestHandler,
>(handler: T): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Terminal error middleware. Normalizes everything into an ApiError envelope. */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let apiError: ApiError;
  let statusCode: number;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    apiError = err.toApiError();
  } else if (err instanceof ZodError) {
    statusCode = 422;
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      (details[key] ??= []).push(issue.message);
    }
    apiError = {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details,
    };
  } else {
    statusCode = 500;
    logger.error('Unhandled error', err);
    apiError = {
      code: 'INTERNAL_ERROR',
      message: isProd
        ? 'Something went wrong'
        : err instanceof Error
          ? err.message
          : 'Unknown error',
    };
  }

  res.status(statusCode).json({ error: apiError });
};
