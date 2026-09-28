import OpenAI from 'openai';
import { AIProviderName } from '@decodr/types';
import type {
  AIProvider,
  ChatMessage,
  CompletionRequest,
  CompletionResult,
  StreamHandlers,
  ToolCall,
} from '../types.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';

/**
 * Unwraps the nested `cause` chain a failed fetch produces. The OpenAI SDK's
 * APIConnectionError says only "Connection error."; the actual reason
 * (ENOTFOUND, ECONNRESET, a TLS or timeout code) is buried underneath.
 */
function describeCause(err: unknown, depth = 0): string {
  if (!(err instanceof Error) || depth > 4) return '';
  const code = (err as NodeJS.ErrnoException).code;
  const here = code ? `${code}: ${err.message}` : err.message;
  const deeper = describeCause((err as { cause?: unknown }).cause, depth + 1);
  return deeper ? `${here} <- ${deeper}` : here;
}

interface RawToolCall {
  id: string;
  function: { name: string; arguments: string };
}

/**
 * Converts our message shape to the OpenAI wire format. Assistant turns that
 * requested tools and the tool results answering them have to round-trip
 * exactly, or the model loses track of which result belongs to which call.
 */
function toWireMessage(m: ChatMessage): Record<string, unknown> {
  if (m.role === 'tool') {
    return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
  }
  if (m.toolCalls && m.toolCalls.length > 0) {
    return {
      role: m.role,
      content: m.content || null,
      tool_calls: m.toolCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.args },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

/** OpenAI implementation of the AIProvider abstraction. */
export class OpenAIProvider implements AIProvider {
  readonly name = AIProviderName.OpenAI;
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseURL: string | undefined;
  private readonly headers: Record<string, string> | undefined;
  private readonly reasoning: boolean;
  private client: OpenAI | null = null;

  constructor(params: {
    apiKey: string;
    model: string;
    baseURL?: string;
    headers?: Record<string, string>;
    reasoning?: boolean;
  }) {
    this.apiKey = params.apiKey;
    this.model = params.model;
    this.baseURL = params.baseURL && params.baseURL.length > 0 ? params.baseURL : undefined;
    this.headers =
      params.headers && Object.keys(params.headers).length > 0 ? params.headers : undefined;
    this.reasoning = params.reasoning ?? false;
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
      ...(this.headers ? { defaultHeaders: this.headers } : {}),
    });
    return this.client;
  }

  /** The shared request body for both completion modes. */
  private buildBody(request: CompletionRequest): Record<string, unknown> {
    return {
      model: this.model,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1024,
      messages: request.messages.map(toWireMessage),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: 'function',
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
            tool_choice: 'auto',
          }
        : {}),
      ...(this.reasoning ? { reasoning: { enabled: true } } : {}),
    };
  }

  /**
   * Streams the answer. Text is forwarded chunk by chunk; tool calls arrive in
   * fragments across many chunks, so they are reassembled by index and returned
   * whole — a half-built call cannot be run.
   */
  async stream(
    request: CompletionRequest,
    handlers: StreamHandlers,
  ): Promise<CompletionResult> {
    const client = this.getClient();
    try {
      const body = { ...this.buildBody(request), stream: true };
      const iterator = (await client.chat.completions.create(
        body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
        request.signal ? { signal: request.signal } : undefined,
      )) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      let text = '';
      let model = this.model;
      const partial = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of iterator) {
        if (chunk.model) model = chunk.model;
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          text += delta.content;
          handlers.onDelta(delta.content);
        }

        for (const call of delta.tool_calls ?? []) {
          const slot = partial.get(call.index) ?? { id: '', name: '', args: '' };
          if (call.id) slot.id = call.id;
          if (call.function?.name) slot.name = call.function.name;
          if (call.function?.arguments) slot.args += call.function.arguments;
          partial.set(call.index, slot);
        }
      }

      const toolCalls: ToolCall[] = [...partial.values()].filter((c) => c.id && c.name);
      return { text, model, ...(toolCalls.length ? { toolCalls } : {}) };
    } catch (err) {
      throw this.toAppError(err);
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    const client = this.getClient();
    try {
      // `reasoning` is an OpenRouter extension not in the OpenAI SDK types, so
      // the body is assembled loosely and cast; the SDK forwards it verbatim.
      const body: Record<string, unknown> = {
        ...this.buildBody(request),
      };

      const response = (await client.chat.completions.create(
        body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
        request.signal ? { signal: request.signal } : undefined,
      )) as OpenAI.Chat.Completions.ChatCompletion;

      const message = response.choices[0]?.message;
      // Prefer the answer content; some reasoning models leave content empty and
      // put the text under `reasoning`, so fall back to that.
      let text = message?.content ?? '';
      if (!text && message) {
        const reasoning = (message as { reasoning?: unknown }).reasoning;
        if (typeof reasoning === 'string') text = reasoning;
      }
      const rawCalls = (message as { tool_calls?: RawToolCall[] } | undefined)?.tool_calls;
      const toolCalls = rawCalls?.map((c) => ({
        id: c.id,
        name: c.function.name,
        args: c.function.arguments,
      }));

      return { text, model: response.model, ...(toolCalls?.length ? { toolCalls } : {}) };
    } catch (err) {
      throw this.toAppError(err);
    }
  }

  /** Maps an SDK error to an AppError, surfacing the real cause of a connection failure. */
  private toAppError(err: unknown): AppError {
    {
      if (err instanceof OpenAI.APIError) {
        // Prefer the provider/gateway's own error message (e.g. "insufficient credits").
        const detail =
          (err.error as { message?: string } | undefined)?.message ?? err.message;
        // A connection failure carries no status; the reason is in the cause chain.
        const cause = err.status === undefined ? describeCause((err as { cause?: unknown }).cause) : '';
        logger.error(
          `AI request failed (${err.status ?? 'network'}) model=${this.model} ` +
            `baseURL=${this.baseURL ?? 'default'}: ${detail}${cause ? ` | cause: ${cause}` : ''}`,
        );
        return new AppError(
          502,
          'AI_PROVIDER_ERROR',
          `AI request failed (${err.status ?? 'network'}): ${detail}${cause ? ` [${cause}]` : ''}`,
        );
      }
      const message = err instanceof Error ? err.message : 'Unknown AI error';
      return new AppError(502, 'AI_PROVIDER_ERROR', `AI request failed: ${message}`);
    }
  }
}
