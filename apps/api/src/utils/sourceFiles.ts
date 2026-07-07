import path from 'node:path';

/** Source-code extensions Arcloom counts and (later) parses. */
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
  // Arcloom's own runtime dirs (so analyzing Arcloom doesn't scan uploaded repos).
  'storage',
  '_uploads',
]);

/** True if the file extension is one Arcloom treats as source code. */
export function isSourceFile(filePath: string): boolean {
  return SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

/** True if the directory name should be skipped during scanning. */
export function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.has(name);
}
