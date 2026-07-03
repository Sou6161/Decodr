import type { Id } from './common.js';

/** How a symbol leaves its module. */
export const ExportKind = {
  Default: 'DEFAULT',
  Named: 'NAMED',
} as const;
export type ExportKind = (typeof ExportKind)[keyof typeof ExportKind];

/** A source file discovered during the scan. */
export interface FileNode {
  id: Id;
  /** Path relative to the repository root, e.g. "src/features/Dashboard/Dashboard.tsx". */
  path: string;
  /** Byte size of the file. */
  sizeBytes: number;
  /** Non-empty line count. */
  lineCount: number;
}

/** A React component extracted by the parser. */
export interface ComponentNode {
  id: Id;
  /** Component identifier, e.g. "Dashboard". */
  name: string;
  /** Repo-relative path of the file that declares it. */
  filePath: string;
  exportKind: ExportKind;
  /** Whether the component is exported from its module. */
  isExported: boolean;
  /** Approximate line span of the component declaration. */
  startLine: number;
  endLine: number;
  /** Number of other components that import this one (in-degree). */
  importedByCount: number;
}

/** A custom hook (a `useX` function) extracted by the parser. */
export interface HookNode {
  id: Id;
  name: string;
  filePath: string;
  isExported: boolean;
  startLine: number;
  endLine: number;
}

/** A React Router route extracted from the routing configuration. */
export interface RouteNode {
  id: Id;
  /** Route path, e.g. "/dashboard/:id". */
  path: string;
  /** Component name rendered for this route, if resolvable. */
  componentName: string | null;
  /** Repo-relative file where the route was declared. */
  filePath: string;
}

/** A single import edge between two files. */
export interface ImportEdge {
  /** Repo-relative path of the importing file. */
  fromPath: string;
  /** The module specifier as written, e.g. "./UserCard" or "react". */
  moduleSpecifier: string;
  /** Resolved repo-relative path of the imported file, or null for externals. */
  toPath: string | null;
  /** Imported symbol names ("default" represents a default import). */
  importedNames: string[];
  /** True when the specifier resolves outside the repository (npm package). */
  isExternal: boolean;
}
