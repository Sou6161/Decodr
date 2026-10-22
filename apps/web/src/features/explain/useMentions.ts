import { useMemo, useState } from 'react';

/**
 * `@`-mention autocomplete for the composer.
 *
 * Retrieval infers which files a question is about from its keywords, and when
 * it infers wrong the answer is confidently about the wrong component. A
 * mention is the reader saying which file they mean, so the server pins it
 * instead of letting it compete on score.
 */

/** How many suggestions to show. Enough to choose from, few enough to scan. */
const MAX_SUGGESTIONS = 7;

export interface MentionState {
  /** Paths to offer, best match first. Empty when the menu should be hidden. */
  suggestions: string[];
  /** Which suggestion is selected, for arrow keys and Enter. */
  active: number;
  setActive: (i: number) => void;
  /** Replaces the partial mention at the caret with a full path. */
  accept: (path: string) => { value: string; caret: number } | null;
  /** True while the menu is open, so the composer can route Enter to it. */
  open: boolean;
  close: () => void;
}

/**
 * Finds the mention being typed at the caret.
 *
 * Only an `@` that starts a word counts, so an email address or a decorator
 * mid-word does not open the menu. A space ends it: paths have no spaces, and
 * without this the "mention" would keep growing over the rest of the sentence.
 */
function activeToken(value: string, caret: number): { start: number; query: string } | null {
  const upto = value.slice(0, caret);
  const at = upto.lastIndexOf('@');
  if (at === -1) return null;
  if (at > 0 && !/[\s(["']/.test(value[at - 1]!)) return null;

  const query = upto.slice(at + 1);
  if (/[\s]/.test(query)) return null;
  return { start: at, query };
}

/** Ranks paths against what has been typed: filename matches beat path matches. */
function rank(paths: string[], query: string): string[] {
  const q = query.toLowerCase();
  if (q.length === 0) return paths.slice(0, MAX_SUGGESTIONS);

  const scored: { path: string; score: number }[] = [];
  for (const path of paths) {
    const lower = path.toLowerCase();
    const file = lower.slice(lower.lastIndexOf('/') + 1);
    // A filename prefix is what someone typing "@Dash" almost always means;
    // a match buried in a directory name is the weakest signal of the three.
    const score = file.startsWith(q) ? 3 : file.includes(q) ? 2 : lower.includes(q) ? 1 : 0;
    if (score > 0) scored.push({ path, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length)
    .slice(0, MAX_SUGGESTIONS)
    .map((s) => s.path);
}

export function useMentions(
  value: string,
  caret: number,
  paths: string[],
): MentionState {
  const [dismissed, setDismissed] = useState<string | null>(null);
  const token = activeToken(value, caret);

  // Keyed on the query text, not on `token`, which is a fresh object every
  // render and would defeat the memo entirely.
  const query = token?.query ?? null;
  const suggestions = useMemo(
    () => (query === null ? [] : rank(paths, query)),
    [query, paths],
  );

  const [active, setActive] = useState(0);
  // Escape hides the menu for the mention currently being typed, without
  // deleting what was typed — reopening on the next keystroke would make the
  // dismissal pointless.
  const open = suggestions.length > 0 && dismissed !== token?.query;

  return {
    suggestions,
    active: Math.min(active, Math.max(suggestions.length - 1, 0)),
    setActive,
    open,
    close: () => setDismissed(token?.query ?? null),
    accept: (path: string) => {
      if (!token) return null;
      // A trailing space closes the mention and lets the question carry on.
      const before = value.slice(0, token.start);
      const after = value.slice(caret);
      const inserted = `@${path} `;
      setActive(0);
      return { value: `${before}${inserted}${after}`, caret: before.length + inserted.length };
    },
  };
}
