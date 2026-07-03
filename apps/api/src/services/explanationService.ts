import type { ExplainResponse } from '@arcloom/types';
import { getAIProvider } from '../ai/providerFactory.js';
import { buildExplanationContext } from '../ai/contextBuilder.js';
import { buildMessages } from '../ai/promptBuilder.js';
import { AppError } from '../utils/AppError.js';

/**
 * Answers an architecture question about a repository. Builds a focused context
 * (only the relevant files), then asks the configured AI provider — the whole
 * repository is never sent to the model.
 */
export async function explainRepository(
  repositoryId: string,
  question: string,
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

  const context = await buildExplanationContext(repositoryId, trimmed);
  if (context.files.length === 0) {
    throw AppError.unprocessable(
      "Couldn't find code relevant to that question. Try naming a component, or ask about routing.",
    );
  }

  const messages = buildMessages(context, trimmed);
  const result = await provider.complete({ messages, temperature: 0.4, maxTokens: 900 });

  return {
    answer: result.text.trim(),
    provider: provider.name,
    model: result.model,
    contextPaths: context.files.map((f) => f.path),
  };
}
