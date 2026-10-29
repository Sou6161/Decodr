import { getAIProvider } from './providerFactory.js';
import { logger } from '../utils/logger.js';
import { finalLineInstruction, finalLines } from './finalAnswer.js';

/**
 * Next questions to offer after an answer.
 *
 * The chips used to be derived on the client from graph nodes whose names
 * appeared in the answer, which is why they often read as beside the point:
 * they knew the import graph but not the conversation. These are written
 * against the answer itself, so "and how does that get cached?" can follow a
 * paragraph about caching.
 *
 * Generated in a separate call *after* the answer is already on screen. Asking
 * for them inside the answer meant either delaying the reply or streaming a
 * delimiter block into the reader's view and stripping it afterwards.
 */

const MAX_FOLLOWUPS = 3;
/**
 * Room to think before answering. At 120 a model that reasons first spent the
 * whole budget narrating and was cut off at "1. Where", so a general question
 * reliably got no suggestions at all. See finalAnswer.ts.
 */
const FOLLOWUP_MAX_TOKENS = 600;
/** A chip has to fit on one line next to two others. */
const FOLLOWUP_MAX_CHARS = 60;
/** How much of the answer the suggestions are drawn from. */
const SOURCE_ANSWER_CHARS = 3000;

const FOLLOWUP_SYSTEM = `You propose the next questions a developer would ask after reading an answer about their codebase.

Given their question and the answer they got, reply with up to three follow-ups, one per line, nothing else.

Rules:
- Each one must be answerable from their codebase, and must go somewhere the answer did NOT already go.
- Write them as the developer would type them: short, direct, first person. "Where is that cached?" not "Could you elaborate on the caching strategy?"
- Name the real thing — the component, file or concept the answer actually mentioned.
- Under 60 characters each. No numbering, no bullets, no quotes, no trailing explanation.
- If the answer was small talk, or genuinely leaves nothing worth asking next, give no FINAL lines at all.` +
  finalLineInstruction('the follow-up questions', { many: true });

/** Strips numbering, bullets and quoting that models add anyway. */
function clean(line: string): string {
  return line
    .trim()
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .trim();
}

/**
 * Returns up to three follow-up questions, or an empty array.
 *
 * Never throws: suggestions are a convenience, and a thread without chips is
 * not a broken thread.
 */
export async function generateFollowUps(
  question: string,
  answer: string,
): Promise<string[]> {
  const provider = getAIProvider();
  if (!provider.isConfigured()) return [];

  try {
    const result = await provider.complete({
      messages: [
        { role: 'system', content: FOLLOWUP_SYSTEM },
        {
          role: 'user',
          content:
            `They asked: ${question.trim().slice(0, 500)}\n\n` +
            `The answer was:\n${answer.trim().slice(0, SOURCE_ANSWER_CHARS)}`,
        },
      ],
      temperature: 0.5,
      maxTokens: FOLLOWUP_MAX_TOKENS,
    });

    // Marked lines when the model used them; otherwise every line, which is what
    // a model that answers directly without reasoning produces.
    const marked = finalLines(result.text);
    return (marked.length > 0 ? marked : result.text.split('\n'))
      .map(clean)
      // A line with no question in it is usually the model narrating ("Here are
      // three follow-ups:"), which is not something to offer as a chip.
      .filter((l) => l.length > 0 && l.length <= FOLLOWUP_MAX_CHARS && /[?]$/.test(l))
      .slice(0, MAX_FOLLOWUPS);
  } catch (err) {
    logger.warn(`Follow-up suggestions skipped: ${err instanceof Error ? err.message : err}`);
    return [];
  }
}
