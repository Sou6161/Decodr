import path from 'node:path';

/** Source-code extensions Decodr counts and (later) parses. */
export const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

/** Extensions the TypeScript parser will analyze in Phase 3. */
export const PARSEABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/** Directories never worth scanning — build output, deps, VCS, caches. */
export const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  '.vercel',
  '.idea',
  '.vscode',
  '__pycache__',
  // Decodr's own runtime dirs (so analyzing Decodr doesn't scan uploaded repos).
  'storage',
  '_uploads',
]);

/**
 * Manifest files kept alongside source. They aren't parsed for components, but
 * they're the only place that answers "which AI / database / libraries does this
 * project use?" — questions no amount of component code can satisfy.
 *
 * Deliberately excludes `.env` itself: only the committed `.example` variants,
 * which hold placeholders rather than real secrets.
 */
export const MANIFEST_FILES = new Set([
  'package.json',
  '.env.example',
  '.env.sample',
]);

/** True if the file is a manifest worth keeping for context (not for parsing). */
export function isManifestFile(filePath: string): boolean {
  return MANIFEST_FILES.has(path.basename(filePath).toLowerCase());
}

/** True if the file extension is one Decodr treats as source code. */
export function isSourceFile(filePath: string): boolean {
  return (
    SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase()) || isManifestFile(filePath)
  );
}

/** True if the directory name should be skipped during scanning. */
export function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name);
}
