import path from 'node:path';

/** Extensions tried when resolving an extensionless import specifier. */
const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

/** True for a repo-local relative specifier (`./x`, `../x`). */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('.');
}

/**
 * Resolves a relative import specifier to a repo-relative file path within the
 * known file set, mirroring Node/TS resolution (extension inference + index
 * files). Returns null for external packages or unresolvable paths.
 *
 * Path aliases (e.g. "@/…") are intentionally out of scope for the MVP.
 */
export function resolveModule(
  fromPath: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
): string | null {
  if (!isRelativeSpecifier(specifier)) return null;

  const baseDir = path.posix.dirname(fromPath);
  const target = path.posix.normalize(path.posix.join(baseDir, specifier));

  // Exact path (specifier already carried an extension).
  if (knownFiles.has(target)) return target;

  // `./Component` → `./Component.tsx`, etc.
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = `${target}${ext}`;
    if (knownFiles.has(candidate)) return candidate;
  }

  // `./feature` → `./feature/index.tsx`, etc.
  for (const ext of RESOLVE_EXTENSIONS) {
    const candidate = path.posix.join(target, `index${ext}`);
    if (knownFiles.has(candidate)) return candidate;
  }

  return null;
}
