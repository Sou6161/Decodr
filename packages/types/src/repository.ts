import type { Id, ISODateString } from './common.js';

/**
 * Lifecycle of an uploaded repository as it moves through the pipeline:
 * upload → extract → scan files → parse/analyze → ready.
 */
export const RepositoryStatus = {
  Pending: 'PENDING',
  Extracting: 'EXTRACTING',
  Scanning: 'SCANNING',
  Analyzing: 'ANALYZING',
  Ready: 'READY',
  Failed: 'FAILED',
} as const;

export type RepositoryStatus =
  (typeof RepositoryStatus)[keyof typeof RepositoryStatus];

/** Coarse progress reported to the UI while a repository is processed. */
export interface RepositoryProgress {
  status: RepositoryStatus;
  /** 0–100. */
  percent: number;
  /** Short human-readable phase label, e.g. "Parsing components". */
  message: string;
}

/** A repository as returned to the client (list + detail summary). */
export interface Repository {
  id: Id;
  name: string;
  status: RepositoryStatus;
  /** Null until analysis has produced an error. */
  error: string | null;
  fileCount: number;
  componentCount: number;
  hookCount: number;
  routeCount: number;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}
