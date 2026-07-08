import type { AIProviderName } from '@decodr/types';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  /** Upper bound on generated tokens. */
  maxTokens?: number;
  temperature?: number;
}

export interface CompletionResult {
  text: string;
  model: string;
}

/**
 * Provider abstraction. Business logic (the explanation engine) depends only on
 * this interface — never on a concrete SDK. Swapping OpenAI for Claude, Gemini,
 * or Ollama is a matter of adding an implementation and a factory branch.
 */
export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  /** True when the provider has the credentials/config it needs to run. */
  isConfigured(): boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}
