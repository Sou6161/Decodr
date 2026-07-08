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

/** A React component discovered in a file. */
export interface ParsedComponent {
  name: string;
  isExported: boolean;
  exportKind: ExportKind;
  isDefaultExport: boolean;
  startLine: number;
  endLine: number;
  /** PascalCase JSX tag names rendered inside this component's body. */
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
  routes: ParsedRoute[];
}
