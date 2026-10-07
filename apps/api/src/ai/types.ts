import type { AIProviderName } from '@decodr/types';

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON arguments as produced by the model. */
  args: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** Present on assistant turns where the model asked to run a tool. */
  toolCalls?: ToolCall[];
  /** Present on tool turns — which call this result answers. */
  toolCallId?: string;
}

/** A function the model may call, described in JSON Schema. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  /** Upper bound on generated tokens. */
  maxTokens?: number;
  temperature?: number;
  /** Tools the model may call. Omit for a plain completion. */
  tools?: ToolSpec[];
  /** Aborts the upstream request — used when the reader stops the answer. */
  signal?: AbortSignal;
}

export interface CompletionResult {
  text: string;
  model: string;
  /**
   * Why the model stopped. 'length' means it ran out of budget mid-sentence and
   * the answer is incomplete — the caller has to ask for the rest.
   */
  finishReason?: string;
  /** Tools the model wants run before it can answer. */
  toolCalls?: ToolCall[];
}

/**
 * Provider abstraction. Business logic (the explanation engine) depends only on
 * this interface — never on a concrete SDK. Swapping OpenAI for Claude, Gemini,
 * or Ollama is a matter of adding an implementation and a factory branch.
 */
/** Incremental output while a completion streams. */
export interface StreamHandlers {
  /** A chunk of answer text. */
  onDelta: (text: string) => void;
  /**
   * Discard everything streamed so far and start again.
   *
   * A model can fail partway through an answer, after the reader has already
   * seen some of it. The next model in the chain begins from scratch, so
   * without this the two halves would be concatenated into nonsense.
   */
  onRestart?: () => void;
}

export interface AIProvider {
  readonly name: AIProviderName;
  readonly model: string;
  /** True when the provider has the credentials/config it needs to run. */
  isConfigured(): boolean;
  complete(request: CompletionRequest): Promise<CompletionResult>;
  /**
   * Same as `complete`, but emits text as it is produced. Tool calls are
   * accumulated and returned in the result rather than streamed, since a partial
   * tool call cannot be acted on.
   */
  stream(request: CompletionRequest, handlers: StreamHandlers): Promise<CompletionResult>;
}
