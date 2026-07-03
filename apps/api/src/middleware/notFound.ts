import type { RequestHandler } from 'express';
import { AppError } from '../utils/AppError.js';

/** Catches unmatched routes and forwards a 404 to the error middleware. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(AppError.notFound(`Route not found: ${req.method} ${req.path}`, 'ROUTE_NOT_FOUND'));
};
