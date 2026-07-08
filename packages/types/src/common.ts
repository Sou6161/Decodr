/**
 * Primitive shared aliases used across the Decodr API surface.
 */

/** ISO-8601 timestamp string (e.g. "2026-06-30T12:00:00.000Z"). */
export type ISODateString = string;

/** Opaque identifier (Prisma cuid). */
export type Id = string;

/** Standard error envelope returned by the API for any failure. */
export interface ApiError {
  /** Stable machine-readable code, e.g. "REPOSITORY_NOT_FOUND". */
  code: string;
  /** Human-readable message safe to show in the UI. */
  message: string;
  /** Optional field-level validation details. */
  details?: Record<string, string[]>;
}

/** Discriminated success/failure envelope (used by the API client). */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };
