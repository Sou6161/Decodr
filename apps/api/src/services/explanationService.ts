import type { ExplainResponse } from '@decodr/types';
import { getAIProvider } from '../ai/providerFactory.js';
import {
  buildExplanationContext,
  DETAILED_LIMITS,
  QUICK_LIMITS,
} from '../ai/contextBuilder.js';
import { buildMessages, type HistoryTurn } from '../ai/promptBuilder.js';
import { AppError } from '../utils/AppError.js';

/**
 * Answers an architecture question about a repository. Builds a focused context
 * (only the relevant files), then asks the configured AI provider — the whole
 * repository is never sent to the model.
 *
 * Detailed mode goes all-out: far more context files, less truncation, and a
 * much larger answer budget, so nothing important gets skipped. Quick mode stays
 * lean and fast.
 */
export async function explainRepository(
  repositoryId: string,
  question: string,
  opts: { detailed?: boolean; history?: HistoryTurn[] } = {},
): Promise<ExplainResponse> {
  const trimmed = question.trim();
  if (trimmed.length < 3) {
    throw AppError.badRequest('Ask a question with at least a few characters.');
  }

  const provider = getAIProvider();
  if (!provider.isConfigured()) {
    throw new AppError(
      503,
      'AI_NOT_CONFIGURED',
      'AI explanations are not configured. Set the provider API key to enable them.',
    );
  }

  const detailed = opts.detailed ?? false;
  const limits = detailed ? DETAILED_LIMITS : QUICK_LIMITS;

  const history = opts.history ?? [];

  // Retrieval query, not the prompt. A follow-up like "why?" or "show me that"
  // has no keywords of its own, so the recent *questions* in the thread are
  // folded in — that's what keeps the file selection on the same subject.
  // Past answers are excluded: they're long and would swamp the keyword scoring.
  const retrievalQuery = [
    ...history
      .filter((t) => t.role === 'user')
      .slice(-2)
      .map((t) => t.content),
    trimmed,
  ].join(' ');

  const context = await buildExplanationContext(repositoryId, retrievalQuery, limits);
  if (context.files.length === 0) {
    throw AppError.unprocessable(
      "Couldn't find code relevant to that question. Try naming a component, or ask about routing.",
    );
  }

  const messages = buildMessages(context, trimmed, { detailed, history });
  const result = await provider.complete({
    messages,
    temperature: 0.4,
    maxTokens: detailed ? 9000 : 1400,
  });

  return {
    answer: result.text.trim(),
    provider: provider.name,
    model: result.model,
    contextPaths: context.files.map((f) => f.path),
  };
}
