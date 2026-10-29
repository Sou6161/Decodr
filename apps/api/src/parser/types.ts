import type { ExportKind } from '@decodr/types';

/** A single imported binding, e.g. `{ UserCard }` or `default as App`. */
export interface ParsedImportName {
  /** Local identifier used in this file. */
  local: string;
  /** Name in the source module ("default" for default imports). */
  imported: string;
  isDefault: boolean;
}

/** One `import ... from '...'` statement. */
export interface ParsedImport {
  moduleSpecifier: string;
  /** Repo-relative path the specifier resolves to, or null for externals. */
  resolvedPath: string | null;
  isExternal: boolean;
  names: ParsedImportName[];
}

/**
 * A re-export: `export { Button } from './Button'`, `export { default as Card }
 * from './Card'`, or `export * from './ui'`. Barrel files are made of these,
 * and without following them an import through `components/index.ts` led to a
 * file that declares nothing and so produced no edge.
 */
export interface ParsedReExport {
  /** Name this file exports it under; '*' for `export * from`. */
  exported: string;
  /** Name in the source module ('default' for a re-exported default, '*' for star). */
  imported: string;
  resolvedPath: string | null;
}

/** A React component discovered in a file. */
export interface ParsedComponent {
  name: string;
  isExported: boolean;
  exportKind: ExportKind;
  isDefaultExport: boolean;
  startLine: number;
  endLine: number;
  /**
   * Component tags rendered inside this component's body: `Header`, or
   * `UI.Button` for a member of a namespace import.
   */
  renderedTags: string[];
}

/** A custom hook (`useX`) discovered in a file. */
export interface ParsedHook {
  name: string;
  isExported: boolean;
  startLine: number;
  endLine: number;
}

/** A React Router route discovered in a file. */
export interface ParsedRoute {
  path: string;
  /** Component name rendered for the route, if statically resolvable. */
  componentName: string | null;
}

/** Everything extracted from a single source file. */
export interface ParsedFile {
  /** Repo-relative path. */
  path: string;
  components: ParsedComponent[];
  hooks: ParsedHook[];
  imports: ParsedImport[];
  reExports: ParsedReExport[];
  routes: ParsedRoute[];
}
