import { getAIProvider } from './providerFactory.js';
import { MAX_HISTORY_TURNS, type HistoryTurn } from './promptBuilder.js';
import { logger } from '../utils/logger.js';

/**
 * Rolling conversation summary.
 *
 * Only turns that have aged out of the verbatim window are summarized, and the
 * result is persisted, so a long thread costs one small extra call *occasionally*
 * rather than re-summarizing the whole history on every question.
 */

/** Summarize only once this many turns have dropped out of the window. */
const SUMMARIZE_BATCH = 4;
/** The summary is a memo, not an essay — this is a hard ceiling. */
const SUMMARY_MAX_TOKENS = 320;
const SUMMARY_MAX_CHARS = 1800;
/** Past answers are clipped hard before summarizing; the opening carries the point. */
const SOURCE_ANSWER_CHARS = 900;

const SUMMARY_SYSTEM = `You compress a technical conversation about a codebase into a terse memo for your own later reference.

Keep: what the user asked about, which components/files/areas were covered, the conclusions reached, and any preference they stated (e.g. "wants more code examples", "cares about the upload flow").
Drop: code snippets, restatements of the question, pleasantries, and anything the attached source files would already show.

Write compact prose or terse bullets. No headings, no preamble, no code blocks. Under 150 words.`;

export interface SummaryState {
  summary: string | null;
  summarizedCount: number;
}

/**
 * Returns an updated summary when enough turns have aged out, or `null` when
 * there's nothing new worth summarizing (the common case — no AI call is made).
 *
 * A failure here is deliberately non-fatal: the summary is an optimization, and
 * losing it degrades context slightly rather than failing the user's question.
 */
export async function maybeExtendSummary(
  history: HistoryTurn[],
  state: SummaryState,
): Promise<{ summary: string; summarizedCount: number } | null> {
  // Turns that will NOT be replayed verbatim are the ones needing a summary.
  const agedOut = Math.max(0, history.length - MAX_HISTORY_TURNS);
  const pending = history.slice(state.summarizedCount, agedOut);

  if (pending.length < SUMMARIZE_BATCH) return null;

  const provider = getAIProvider();
  if (!provider.isConfigured()) return null;

  const transcript = pending
    .map((t) => {
      const body =
        t.role === 'assistant' && t.content.length > SOURCE_ANSWER_CHARS
          ? `${t.content.slice(0, SOURCE_ANSWER_CHARS)}…`
          : t.content;
      return `${t.role === 'user' ? 'Q' : 'A'}: ${body}`;
    })
    .join('\n\n');

  const instruction = state.summary
    ? `Existing memo:\n${state.summary}\n\nFold these newer turns into it, keeping it under 150 words total:\n\n${transcript}`
    : `Summarize these turns:\n\n${transcript}`;

  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: SUMMARY_SYSTEM },
        { role: 'user', content: instruction },
      ],
      temperature: 0.2,
      maxTokens: SUMMARY_MAX_TOKENS,
    });

    const text = result.text.trim();
    if (!text) return null;

    return {
      summary: text.slice(0, SUMMARY_MAX_CHARS),
      summarizedCount: agedOut,
    };
  } catch (err) {
    logger.warn(`Conversation summary skipped: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
