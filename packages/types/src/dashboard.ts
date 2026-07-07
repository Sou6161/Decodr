/** A node in the repository's folder tree (a folder or a file). */
export interface FolderTreeNode {
  /** Segment name, e.g. "rides" or "search.tsx". */
  name: string;
  /** Full repo-relative path. */
  path: string;
  type: 'folder' | 'file';
  /** Files in this subtree (1 for a file node). */
  fileCount: number;
  /** React components in this subtree. */
  componentCount: number;
  /** Present for folders. */
  children?: FolderTreeNode[];
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
  /** Number of distinct folders containing source files. */
  totalFolders: number;
  largestComponents: RankedComponent[];
  mostImportedComponents: RankedComponent[];
  /** Hierarchical project structure (top-level nodes). */
  tree: FolderTreeNode[];
}
