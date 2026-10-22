/**
 * Files the reader named explicitly, or that an error they pasted points at.
 *
 * Retrieval infers which files a question is about from its keywords. That is
 * the right default and it is also the single biggest source of wrong answers —
 * asking about `WhereIsEveryoneMap` and getting an explanation of `ProfileImage`
 * is keyword scoring doing exactly what it was built to do. A mention is the
 * reader overriding the guess, so a mentioned file is pinned into context rather
 * than left to compete on score.
 */

/** `@src/features/Dashboard.tsx` — what the composer's autocomplete inserts. */
const MENTION_RE = /@([\w./-]*[\w-]\/[\w./-]*\.[a-z]{2,4}|[\w-]+\.[a-z]{2,4})\b/gi;

/**
 * A path inside a stack trace or build error: `at Foo (src/App.tsx:42:11)`,
 * `src/App.tsx(42,11): error TS2322`, `./src/App.tsx`.
 */
const TRACE_PATH_RE = /(?:^|[\s("'[])\.?\/?((?:[\w.-]+\/)+[\w.-]+\.[a-z]{2,4})(?=[\s:)("'\],]|$)/gim;

/** Looks like something was pasted from a console rather than typed. */
const LOOKS_LIKE_ERROR =
  /\b(error|exception|failed|cannot\s+find|is\s+not\s+a\s+function|undefined\s+is\s+not|unhandled|traceback|stack\s*trace|at\s+\w+\s*\()|\bTS\d{4}\b|\bERR_[A-Z_]+\b/i;

export interface Mentions {
  /** Resolved repo-relative paths to pin into context, in the order named. */
  paths: string[];
  /** True when the message reads like a pasted error rather than a question. */
  isError: boolean;
}

/**
 * Resolves one written path against the repository's real paths.
 *
 * Tolerant on purpose: people paste `./src/App.tsx`, `/src/App.tsx` or just
 * `App.tsx`, and a bundler trace may carry a prefix that is not in the repo at
 * all. An exact match wins; otherwise the shortest path ending in what they
 * wrote, which is the least surprising choice when several files share a name.
 */
function resolve(written: string, allPaths: string[]): string | null {
  const needle = written.replace(/^\.?\//, '');
  if (allPaths.includes(needle)) return needle;

  const suffixMatches = allPaths
    .filter((p) => p === needle || p.endsWith(`/${needle}`))
    .sort((a, b) => a.length - b.length);
  return suffixMatches[0] ?? null;
}

/**
 * Pulls out every file the message points at, whether by `@mention` or by
 * appearing in a pasted error.
 *
 * @param allPaths every path in the repository, used to resolve what was written
 */
export function extractMentions(text: string, allPaths: string[]): Mentions {
  const found: string[] = [];
  const add = (written: string): void => {
    const resolved = resolve(written, allPaths);
    if (resolved && !found.includes(resolved)) found.push(resolved);
  };

  for (const m of text.matchAll(MENTION_RE)) add(m[1]!);

  // Paths inside a trace are only worth chasing when the text actually looks
  // like an error. Otherwise an ordinary sentence that happens to contain
  // "package.json" would start pinning files nobody asked about.
  const isError = LOOKS_LIKE_ERROR.test(text);
  if (isError) {
    for (const m of text.matchAll(TRACE_PATH_RE)) add(m[1]!);
  }

  return { paths: found, isError };
}

/**
 * Cheap pre-check, so an ordinary question does not pay for the path query.
 *
 * Resolving mentions needs every path in the repository, and most messages
 * contain neither an `@` nor anything resembling an error, so there is nothing
 * to resolve. This is deliberately loose: it only decides whether to look.
 */
export function mightReferenceFiles(text: string): boolean {
  return /@[\w./-]/.test(text) || LOOKS_LIKE_ERROR.test(text);
}
