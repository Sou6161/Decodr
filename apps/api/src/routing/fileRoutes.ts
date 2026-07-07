/**
 * File-based route detection for conventions where the router is derived from
 * the filesystem rather than from JSX: Expo Router and Next.js (App + Pages
 * routers). This maps file *paths* to URL routes exactly as those frameworks do
 * — it inspects paths, never source text, so it complements the AST-based
 * React Router parser.
 */

export interface DerivedRoute {
  /** URL path, e.g. "/rides/:id". */
  routePath: string;
  /** Repo-relative file that defines the route. */
  filePath: string;
}

const ROUTE_EXT = /\.(tsx|ts|jsx|js)$/;

const stripExt = (name: string): string => name.replace(ROUTE_EXT, '');
const baseName = (path: string): string => path.split('/').pop() ?? path;

/**
 * Maps a path segment to its URL form:
 *  - route groups `(group)` are omitted from the URL
 *  - catch-all `[...rest]` / `[[...rest]]` → `*`
 *  - dynamic `[id]` → `:id`
 */
function transformSegment(segment: string): string | null {
  if (/^\(.*\)$/.test(segment)) return null;
  if (/^\[\[?\.\.\..+\]\]?$/.test(segment)) return '*';
  const dynamic = /^\[(.+)\]$/.exec(segment);
  if (dynamic) return `:${dynamic[1]}`;
  return segment;
}

/** Builds a "/"-prefixed route from path segments (index already removed). */
function toRoutePath(segments: string[]): string {
  const parts = segments
    .map(transformSegment)
    .filter((s): s is string => s !== null && s.length > 0);
  return `/${parts.join('/')}`.replace(/\/{2,}/g, '/');
}

/** Distinct path prefixes ending at a `dirName` segment (handles nesting like `frontend/app`). */
function dirPrefixes(paths: string[], dirName: string): string[] {
  const prefixes = new Set<string>();
  for (const p of paths) {
    const segs = p.split('/');
    const idx = segs.indexOf(dirName);
    if (idx !== -1) prefixes.add(segs.slice(0, idx + 1).join('/'));
  }
  return [...prefixes];
}

/** Next.js App Router: routes are `page.*` files; the URL comes from their folder. */
function nextAppRoutes(prefix: string, under: string[]): DerivedRoute[] {
  return under
    .filter((p) => /(^|\/)page\.(tsx|ts|jsx|js)$/.test(p))
    .map((filePath) => {
      const rel = filePath.slice(prefix.length + 1); // e.g. "blog/[slug]/page.tsx"
      const dirSegments = rel.split('/').slice(0, -1); // drop "page.tsx"
      return { routePath: toRoutePath(dirSegments), filePath };
    });
}

/** Expo Router: every non-special file under `app/` is a route. */
function expoRoutes(prefix: string, under: string[]): DerivedRoute[] {
  return under
    .filter((p) => ROUTE_EXT.test(p))
    .filter((p) => {
      const name = baseName(p);
      return !name.startsWith('_') && !name.startsWith('+');
    })
    .map((filePath) => {
      const rel = stripExt(filePath.slice(prefix.length + 1));
      const segments = rel.split('/');
      if (segments[segments.length - 1] === 'index') segments.pop();
      return { routePath: toRoutePath(segments), filePath };
    });
}

/** Next.js Pages Router: every non-special file under `pages/` (excluding `api/`) is a route. */
function nextPagesRoutes(prefix: string, under: string[]): DerivedRoute[] {
  const SPECIAL = new Set(['_app', '_document', '_error']);
  return under
    .filter((p) => ROUTE_EXT.test(p))
    .filter((p) => !p.startsWith(`${prefix}/api/`))
    .filter((p) => !SPECIAL.has(stripExt(baseName(p))))
    .map((filePath) => {
      const rel = stripExt(filePath.slice(prefix.length + 1));
      const segments = rel.split('/');
      if (segments[segments.length - 1] === 'index') segments.pop();
      return { routePath: toRoutePath(segments), filePath };
    });
}

/**
 * Detects the routing convention per candidate directory and derives routes.
 * Markers keep false positives low: a folder literally named `app` is only
 * treated as a router when it contains `page.*` (Next) or `_layout.*` (Expo).
 */
export function deriveFileBasedRoutes(paths: string[]): DerivedRoute[] {
  const routes: DerivedRoute[] = [];

  for (const prefix of dirPrefixes(paths, 'app')) {
    const under = paths.filter((p) => p.startsWith(`${prefix}/`));
    const hasPage = under.some((p) => /(^|\/)page\.(tsx|ts|jsx|js)$/.test(p));
    const hasExpoLayout = under.some((p) => /(^|\/)_layout\.(tsx|ts|jsx|js)$/.test(p));
    if (hasPage) routes.push(...nextAppRoutes(prefix, under));
    else if (hasExpoLayout) routes.push(...expoRoutes(prefix, under));
  }

  for (const prefix of dirPrefixes(paths, 'pages')) {
    const under = paths.filter((p) => p.startsWith(`${prefix}/`));
    const looksNext =
      under.some((p) => /(^|\/)(_app|_document)\.(tsx|ts|jsx|js)$/.test(p)) ||
      under.some((p) => p === `${prefix}/index.tsx` || p === `${prefix}/index.jsx` ||
        p === `${prefix}/index.ts` || p === `${prefix}/index.js`);
    if (looksNext) routes.push(...nextPagesRoutes(prefix, under));
  }

  // Dedupe by URL path (multiple index files can map to "/").
  const seen = new Set<string>();
  return routes.filter((r) => {
    if (seen.has(r.routePath)) return false;
    seen.add(r.routePath);
    return true;
  });
}
