import { useMemo, useState } from 'react';

/**
 * `@`-mention autocomplete for the composer.
 *
 * Retrieval infers which files a question is about from its keywords, and when
 * it infers wrong the answer is confidently about the wrong component. A
 * mention is the reader saying which file they mean, so the server pins it
 * instead of letting it compete on score.
 */

/**
 * How many matches to render.
 *
 * Was 7, which meant a bare `@` offered the first seven paths alphabetically —
 * in a monorepo that is seven files from `apps/api`, none of which anyone was
 * looking for. The menu scrolls, so the honest thing is to show the project and
 * let typing narrow it; the cap only exists to stop a thousand-file repo
 * building a thousand DOM nodes on every keystroke.
 */
const MAX_SUGGESTIONS = 50;

export interface MentionState {
  /** Paths to offer, best match first. Empty when the menu should be hidden. */
  suggestions: string[];
  /** How many matched in total, which may exceed what is rendered. */
  total: number;
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

/**
 * Source files people actually mean when they point at something, ranked above
 * config and generated noise. Used to order the list before anything is typed.
 */
const INTERESTING = /\.(tsx|jsx|ts|js)$/i;
const BORING = /(^|\/)(\.|dist\/|build\/|coverage\/)|\.(json|lock|md|ya?ml|txt|example)$/i;

/** Ranks paths against what has been typed: filename matches beat path matches. */
function rank(paths: string[], query: string): { matches: string[]; total: number } {
  const q = query.toLowerCase();

  // Nothing typed yet: lead with the files someone is plausibly about to name —
  // components and modules — rather than whatever sorts first alphabetically.
  if (q.length === 0) {
    const ordered = [...paths].sort((a, b) => weight(b) - weight(a) || a.localeCompare(b));
    return { matches: ordered.slice(0, MAX_SUGGESTIONS), total: paths.length };
  }

  const scored: { path: string; score: number }[] = [];
  for (const path of paths) {
    const lower = path.toLowerCase();
    const file = lower.slice(lower.lastIndexOf('/') + 1);
    // A filename prefix is what someone typing "@Dash" almost always means;
    // a match buried in a directory name is the weakest signal of the three.
    const score = file.startsWith(q) ? 3 : file.includes(q) ? 2 : lower.includes(q) ? 1 : 0;
    if (score > 0) scored.push({ path, score });
  }
  const sorted = scored
    .sort((a, b) => b.score - a.score || weight(b.path) - weight(a.path) || a.path.length - b.path.length)
    .map((x) => x.path);
  return { matches: sorted.slice(0, MAX_SUGGESTIONS), total: sorted.length };
}

/** Higher sorts earlier: real source first, config and dotfiles last. */
function weight(path: string): number {
  if (BORING.test(path)) return 0;
  return INTERESTING.test(path) ? 2 : 1;
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
  const { matches: suggestions, total } = useMemo(
    () => (query === null ? { matches: [], total: 0 } : rank(paths, query)),
    [query, paths],
  );

  const [active, setActive] = useState(0);
  // Escape hides the menu for the mention currently being typed, without
  // deleting what was typed — reopening on the next keystroke would make the
  // dismissal pointless.
  const open = suggestions.length > 0 && dismissed !== token?.query;

  return {
    suggestions,
    total,
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
