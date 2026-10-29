import path from 'node:path';
import ts from 'typescript';

/** Extensions tried when resolving an extensionless import specifier. */
const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs'];

/**
 * What a written `.js`-family extension can stand for in a TypeScript project.
 *
 * Under `module: NodeNext` an import of `./x.js` is how you name `./x.ts` —
 * the specifier carries the extension the file will have AFTER compilation.
 * Matching it literally left every such import unresolved, so a project in
 * that style (Decodr's own API among them) produced no cross-file edges.
 */
const COMPILED_TO_SOURCE: Record<string, string[]> = {
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx'],
  '.mjs': ['.mts'],
  '.cjs': ['.cts'],
};

/** One `paths` entry from a tsconfig/jsconfig, e.g. `"@/*": ["src/*"]`. */
export interface AliasPattern {
  pattern: string;
  targets: string[];
}

/** The resolution settings of one tsconfig/jsconfig in the project. */
export interface AliasConfig {
  /** Repo-relative directory holding the config ('' for the root). */
  configDir: string;
  /** Repo-relative baseUrl directory, or null when the config sets none. */
  baseUrl: string | null;
  /** Directory `paths` targets are resolved from: baseUrl, else the declaring config's dir. */
  pathsRoot: string;
  paths: AliasPattern[];
}

/** True for a repo-local relative specifier (`./x`, `../x`). */
export function isRelativeSpecifier(specifier: string): boolean {
  return specifier.startsWith('.');
}

/**
 * Finds a real file for a repo-relative target: the exact path, a `.js` written
 * for a `.ts` source, an inferred extension, or an `index.*` inside a folder.
 */
function tryFile(target: string, knownFiles: ReadonlySet<string>): string | null {
  const normalized = path.posix.normalize(target).replace(/^\.\//, '');
  if (knownFiles.has(normalized)) return normalized;

  const ext = path.posix.extname(normalized);
  for (const sourceExt of COMPILED_TO_SOURCE[ext] ?? []) {
    const candidate = `${normalized.slice(0, -ext.length)}${sourceExt}`;
    if (knownFiles.has(candidate)) return candidate;
  }

  for (const e of RESOLVE_EXTENSIONS) {
    const candidate = `${normalized}${e}`;
    if (knownFiles.has(candidate)) return candidate;
  }
  for (const e of RESOLVE_EXTENSIONS) {
    const candidate = path.posix.join(normalized, `index${e}`);
    if (knownFiles.has(candidate)) return candidate;
  }
  return null;
}

/** True when `dir` is `fromPath`'s directory or one of its ancestors. */
function contains(dir: string, fromPath: string): boolean {
  return dir === '' || fromPath === dir || fromPath.startsWith(`${dir}/`);
}

/** Matches a `paths` pattern (at most one `*`), returning what the `*` captured. */
function matchPattern(pattern: string, specifier: string): string | null {
  const star = pattern.indexOf('*');
  if (star === -1) return pattern === specifier ? '' : null;
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) return null;
  if (specifier.length < prefix.length + suffix.length) return null;
  return specifier.slice(prefix.length, specifier.length - suffix.length);
}

/** Resolves a non-relative specifier through the nearest config's `paths` and `baseUrl`. */
function resolveAlias(
  fromPath: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
  aliases: readonly AliasConfig[],
): string | null {
  // Nearest config first: in a monorepo each app has its own `@/`.
  const applicable = aliases
    .filter((a) => contains(a.configDir, fromPath))
    .sort((a, b) => b.configDir.length - a.configDir.length);

  for (const config of applicable) {
    // TypeScript resolves `paths` targets against baseUrl, or against the
    // declaring config's directory when no baseUrl is set (TS 4.1+).
    const root = config.pathsRoot;
    // An exact pattern wins, then the longest prefix before `*`, as in the compiler.
    const prefixLength = (p: string) => (p.includes('*') ? p.indexOf('*') : Infinity);
    const patterns = [...config.paths].sort(
      (a, b) => prefixLength(b.pattern) - prefixLength(a.pattern),
    );
    for (const { pattern, targets } of patterns) {
      const captured = matchPattern(pattern, specifier);
      if (captured === null) continue;
      for (const target of targets) {
        const found = tryFile(path.posix.join(root, target.replace('*', captured)), knownFiles);
        if (found) return found;
      }
    }
    if (config.baseUrl !== null) {
      const found = tryFile(path.posix.join(config.baseUrl, specifier), knownFiles);
      if (found) return found;
    }
  }

  // No config describes it, but `@/x` and `~/x` meaning `src/x` is close to
  // universal (Vite, Next and CRA templates all ship it). Only those two
  // prefixes are guessed at — a bare `components/x` could be an npm package.
  const conventional = /^[@~]\/(.+)$/.exec(specifier);
  if (conventional) {
    const segments = fromPath.split('/').slice(0, -1);
    for (let i = segments.length; i >= 0; i -= 1) {
      const base = segments.slice(0, i).join('/');
      const found = tryFile(path.posix.join(base, 'src', conventional[1]!), knownFiles);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Resolves an import specifier to a repo-relative file path within the known
 * file set, mirroring TypeScript's own resolution: relative paths, extension
 * inference, `index.*` files, `.js` specifiers naming `.ts` sources, and the
 * project's tsconfig/jsconfig `paths` and `baseUrl`. Returns null for external
 * packages or unresolvable paths.
 */
export function resolveModule(
  fromPath: string,
  specifier: string,
  knownFiles: ReadonlySet<string>,
  aliases: readonly AliasConfig[] = [],
): string | null {
  if (isRelativeSpecifier(specifier)) {
    const baseDir = path.posix.dirname(fromPath);
    return tryFile(path.posix.join(baseDir, specifier), knownFiles);
  }
  return resolveAlias(fromPath, specifier, knownFiles, aliases);
}

/** tsconfig.json, tsconfig.app.json, jsconfig.json … anywhere in the project. */
export const CONFIG_FILE_RE = /(^|\/)(tsconfig(\.[\w-]+)?|jsconfig)\.json$/i;

interface RawCompilerOptions {
  baseUrl?: unknown;
  paths?: unknown;
}

/**
 * Reads the alias settings out of every tsconfig/jsconfig in the project.
 *
 * Parsed with the compiler's own JSON reader because these files allow
 * comments and trailing commas, which `JSON.parse` rejects. `extends` is
 * followed when it points at another config in the upload, so a Vite app whose
 * `paths` live in `tsconfig.app.json` or a shared base config still resolves.
 */
export function readAliasConfigs(configs: Map<string, string>): AliasConfig[] {
  const raw = new Map<string, { options: RawCompilerOptions; extends: string[] }>();
  for (const [filePath, text] of configs) {
    const { config } = ts.parseConfigFileTextToJson(filePath, text);
    if (!config || typeof config !== 'object') continue;
    const ext = (config as { extends?: unknown }).extends;
    raw.set(filePath, {
      options: ((config as { compilerOptions?: RawCompilerOptions }).compilerOptions ?? {}),
      extends: (Array.isArray(ext) ? ext : ext ? [ext] : []).filter(
        (e): e is string => typeof e === 'string',
      ),
    });
  }

  /** Effective options for a config, inheriting through `extends` (cycle-safe). */
  const effective = (
    filePath: string,
    seen: Set<string>,
  ): { baseUrl?: { value: string; from: string }; paths?: { value: unknown; from: string } } => {
    const entry = raw.get(filePath);
    if (!entry || seen.has(filePath)) return {};
    seen.add(filePath);
    let out: ReturnType<typeof effective> = {};
    for (const parent of entry.extends) {
      if (!parent.startsWith('.')) continue; // a package base config is not in the upload
      const parentPath = path.posix.normalize(
        path.posix.join(path.posix.dirname(filePath), parent.endsWith('.json') ? parent : `${parent}.json`),
      );
      out = { ...out, ...effective(parentPath, seen) };
    }
    if (typeof entry.options.baseUrl === 'string') {
      out.baseUrl = { value: entry.options.baseUrl, from: filePath };
    }
    if (entry.options.paths && typeof entry.options.paths === 'object') {
      out.paths = { value: entry.options.paths, from: filePath };
    }
    return out;
  };

  const result: AliasConfig[] = [];
  for (const filePath of raw.keys()) {
    const opts = effective(filePath, new Set());
    if (!opts.baseUrl && !opts.paths) continue;

    // baseUrl and paths are relative to the config that declared them, which
    // after `extends` is not necessarily this one.
    const baseUrl = opts.baseUrl
      ? path.posix.normalize(path.posix.join(path.posix.dirname(opts.baseUrl.from), opts.baseUrl.value)).replace(/^\.$/, '')
      : null;
    const pathsDir = path.posix.dirname(opts.paths?.from ?? filePath).replace(/^\.$/, '');

    const paths: AliasPattern[] = [];
    for (const [pattern, targets] of Object.entries((opts.paths?.value ?? {}) as Record<string, unknown>)) {
      if (!Array.isArray(targets)) continue;
      paths.push({ pattern, targets: targets.filter((t): t is string => typeof t === 'string') });
    }

    result.push({
      configDir: path.posix.dirname(filePath).replace(/^\.$/, ''),
      baseUrl,
      // Without a baseUrl, paths resolve from the config that declared them.
      pathsRoot: baseUrl ?? pathsDir,
      paths,
    });
  }
  return result;
}
