import type { ApiError } from '@arcloom/types';

/**
 * Application-level error carrying an HTTP status, a stable machine code, and a
 * user-safe message. The error middleware translates this into an ApiError body.
 */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (details) this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  toApiError(): ApiError {
    return {
      code: this.code,
      message: this.message,
      ...(this.details ? { details: this.details } : {}),
    };
  }

  static badRequest(message: string, details?: Record<string, string[]>) {
    return new AppError(400, 'BAD_REQUEST', message, details);
  }

  static notFound(message = 'Resource not found', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static unprocessable(message: string, details?: Record<string, string[]>) {
    return new AppError(422, 'UNPROCESSABLE_ENTITY', message, details);
  }

  static internal(message = 'Something went wrong') {
    return new AppError(500, 'INTERNAL_ERROR', message);
  }
}
