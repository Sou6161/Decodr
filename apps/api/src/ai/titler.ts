import { getAIProvider } from './providerFactory.js';
import { logger } from '../utils/logger.js';

/**
 * Names a conversation.
 *
 * Titles used to be the first line of the first question, truncated. That is
 * fine for "How does auth work?" and useless for everything else — a pasted
 * paragraph became seventy characters of its opening clause, and the sidebar
 * filled up with entries nobody could tell apart. A short label of what the
 * thread is actually about is what makes a chat list browsable.
 */

/** A title is a label, not a sentence; this is a hard ceiling. */
const TITLE_MAX_CHARS = 48;
const TITLE_MAX_TOKENS = 24;

const TITLE_SYSTEM = `You name a chat thread. Given the user's opening question, reply with a title of 2 to 5 words and nothing else.

Rules:
- Name the subject, the way a person labels a tab: "Auth flow", "Dashboard data fetching", "useMemo vs useCallback".
- No quotes, no trailing period, no "How to", no "Explaining", no "Question about", no restating the whole question.
- Use the real component, file or concept name when the question names one.
- Sentence case, not Title Case.

Reply with the title only.`;

/** Strips the wrapping a model adds even when told not to. */
function clean(raw: string): string {
  const line = raw.trim().split('\n')[0] ?? '';
  return line
    .replace(/^["'`*#\s]+|["'`*.\s]+$/g, '')
    .replace(/^(title|chat|thread)\s*:\s*/i, '')
    .slice(0, TITLE_MAX_CHARS)
    .trim();
}

/**
 * The title to use when the model cannot be reached: the old behaviour, kept as
 * the fallback so a thread always has a usable name.
 */
export function fallbackTitle(question: string): string {
  const firstLine = question.trim().split('\n')[0]!.trim();
  return firstLine.length > 70 ? `${firstLine.slice(0, 70)}…` : firstLine;
}

/**
 * Generates a short title for a thread, or `null` if it could not.
 *
 * Runs in the background after the answer has already been sent, so it never
 * adds latency to the question that started the thread. A failure is logged and
 * ignored — the fallback title is already saved.
 */
export async function generateTitle(question: string): Promise<string | null> {
  const provider = getAIProvider();
  if (!provider.isConfigured()) return null;

  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: TITLE_SYSTEM },
        // Long questions are clipped: the subject is always near the start, and
        // a whole pasted file would cost more than the title is worth.
        { role: 'user', content: question.trim().slice(0, 1000) },
      ],
      temperature: 0.3,
      maxTokens: TITLE_MAX_TOKENS,
    });

    const title = clean(result.text);
    // A single word is usually the model echoing a stray token rather than
    // naming anything; the fallback reads better than "Code".
    return title.split(/\s+/).length >= 2 ? title : null;
  } catch (err) {
    logger.warn(`Chat title skipped: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
