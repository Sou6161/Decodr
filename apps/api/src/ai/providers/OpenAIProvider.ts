import OpenAI from 'openai';
import { AIProviderName } from '@arcloom/types';
import type {
  AIProvider,
  CompletionRequest,
  CompletionResult,
} from '../types.js';
import { AppError } from '../../utils/AppError.js';

/** OpenAI implementation of the AIProvider abstraction. */
export class OpenAIProvider implements AIProvider {
  readonly name = AIProviderName.OpenAI;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string | undefined;
  private client: OpenAI | null = null;

  constructor(params: { apiKey: string; model: string; baseURL?: string }) {
    this.apiKey = params.apiKey;
    this.model = params.model;
    this.baseURL = params.baseURL && params.baseURL.length > 0 ? params.baseURL : undefined;
  }

  isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  private getClient(): OpenAI {
    if (!this.isConfigured()) {
      throw new AppError(
        503,
        'AI_NOT_CONFIGURED',
        'OpenAI is not configured. Set OPENAI_API_KEY to enable explanations.',
      );
    }
    this.client ??= new OpenAI({
      apiKey: this.apiKey,
      ...(this.baseURL ? { baseURL: this.baseURL } : {}),
    });
    return this.client;
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const client = this.getClient();
    try {
      const response = await client.chat.completions.create({
        model: this.model,
        temperature: request.temperature ?? 0.2,
        max_tokens: request.maxTokens ?? 1024,
        messages: request.messages,
      });
      const text = response.choices[0]?.message?.content ?? '';
      return { text, model: response.model };
    } catch (err) {
      if (err instanceof OpenAI.APIError) {
        // Prefer the provider/gateway's own error message (e.g. "insufficient credits").
        const detail =
          (err.error as { message?: string } | undefined)?.message ?? err.message;
        throw new AppError(
          502,
          'AI_PROVIDER_ERROR',
          `AI request failed (${err.status ?? 'network'}): ${detail}`,
        );
      }
      const message = err instanceof Error ? err.message : 'Unknown AI error';
      throw new AppError(502, 'AI_PROVIDER_ERROR', `AI request failed: ${message}`);
    }
  }
}
