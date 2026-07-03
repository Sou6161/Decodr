/** A folder in the repository's directory tree with aggregate counts. */
export interface FolderSummary {
  /** Repo-relative folder path, e.g. "src/features". */
  path: string;
  fileCount: number;
  componentCount: number;
}

/** A ranked component entry (largest / most-imported lists). */
export interface RankedComponent {
  name: string;
  filePath: string;
  /** The metric this ranking is based on (lines or import count). */
  value: number;
}

/** Aggregate insights powering the repository dashboard. */
export interface DashboardStats {
  totalFiles: number;
  totalComponents: number;
  totalHooks: number;
  totalRoutes: number;
  totalLines: number;
  largestComponents: RankedComponent[];
  mostImportedComponents: RankedComponent[];
  folders: FolderSummary[];
}
