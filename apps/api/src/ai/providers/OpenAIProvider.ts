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

/**
 * Turns an upstream failure into something the reader can act on.
 *
 * Provider messages are passed through verbatim nowhere: they name the gateway,
 * the upstream vendor and the model ("Upstream error from Nvidia: Service
 * temporarily overloaded"), which is nobody's business but ours and tells the
 * reader nothing about what to do next. The detail is logged instead.
 */
export function userFacingMessage(status: number | undefined, detail: string): string {
  const text = detail.toLowerCase();

  if (status === 429 || text.includes('rate limit')) {
    return 'The explanation service is rate limited right now. Please wait a moment and try again.';
  }
  if (status === 402 || text.includes('credit') || text.includes('quota') || text.includes('billing')) {
    return 'The explanation service is unavailable right now. Try Quick mode, or try again later.';
  }
  if (status === 401 || status === 403) {
    return 'Explanations are not configured correctly. This needs fixing on the server.';
  }
  if (status === undefined) {
    return 'Could not reach the explanation service. Please try again.';
  }
  if (status >= 500 || text.includes('overload') || text.includes('timeout') || text.includes('unavailable')) {
    return 'The explanation service is busy. Please try again in a moment.';
  }
  return 'The explanation service had a problem. Please try again.';
}

/**
 * True when another model has a real chance of succeeding where this one did not.
 *
 * Deliberately excludes 400 and 401/403: a malformed request or a bad key is
 * wrong everywhere, and retrying it just spends the reader's time.
 */
export function worthRetryingElsewhere(status: number | undefined, err: unknown): boolean {
  if (status === 429 || status === 402 || status === 404) return true;
  if (status !== undefined && status >= 500) return true;

  // A 400 is usually a malformed request — wrong on every model — but it is also
  // what a gateway returns for a model name it does not recognise, which the
  // next model in the chain would not share.
  if (status === 400) {
    const text = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return text.includes('model');
  }

  // A connection failure, unless the caller aborted on purpose.
  if (status === undefined) {
    return !(err instanceof Error && err.name === 'AbortError');
  }
  return false;
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

  /** Models to try in order; index 0 is `model`. */
  private readonly chain: string[];

  constructor(params: {
    apiKey: string;
    model: string;
    /** Tried in order when the current model fails for a reason a retry could fix. */
    fallbacks?: string[];
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
    this.chain = [params.model, ...(params.fallbacks ?? [])].filter(
      (m, i, all) => m && all.indexOf(m) === i,
    );
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

  /**
   * Runs an attempt against each model in turn, moving on when the failure is
   * one a different model could survive.
   *
   * A bad key or a malformed request will fail identically everywhere, so those
   * stop immediately — retrying them would only multiply the latency. Overload,
   * rate limits and exhausted credits are specific to a model or its pool, and
   * those are exactly what the free shared pools produce.
   */
  private async withFallback(
    attempt: (model: string) => Promise<CompletionResult>,
    /** Called before a retry, so a partly-streamed answer can be discarded. */
    onRestart?: () => void,
  ): Promise<CompletionResult> {
    let lastError: unknown;

    for (const [index, model] of this.chain.entries()) {
      try {
        const result = await attempt(model);
        if (index > 0) {
          logger.info(`AI fell back to ${model} (primary: ${this.chain[0]})`);
        }
        return result;
      } catch (err) {
        lastError = err;
        const status = err instanceof OpenAI.APIError ? err.status : undefined;
        const isLast = index === this.chain.length - 1;
        if (isLast || !worthRetryingElsewhere(status, err)) throw this.toAppError(err);
        logger.warn(
          `AI model ${model} failed (${status ?? 'network'}); trying ${this.chain[index + 1]}`,
        );
        onRestart?.();
      }
    }
    throw this.toAppError(lastError);
  }

  /** The shared request body for both completion modes. */
  private buildBody(request: CompletionRequest, model: string): Record<string, unknown> {
    return {
      model,
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
    return this.withFallback(
      (model) => this.streamOnce(request, handlers, model),
      handlers.onRestart,
    );
  }

  private async streamOnce(
    request: CompletionRequest,
    handlers: StreamHandlers,
    model: string,
  ): Promise<CompletionResult> {
    const client = this.getClient();
    try {
      const body = { ...this.buildBody(request, model), stream: true };
      const iterator = (await client.chat.completions.create(
        body as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming,
        request.signal ? { signal: request.signal } : undefined,
      )) as unknown as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

      let text = '';
      let answered = model;
      let finishReason: string | undefined;
      const partial = new Map<number, { id: string; name: string; args: string }>();

      for await (const chunk of iterator) {
        if (chunk.model) answered = chunk.model;
        const reason = chunk.choices[0]?.finish_reason;
        if (reason) finishReason = reason;
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
      return {
        text,
        model: answered,
        ...(finishReason ? { finishReason } : {}),
        ...(toolCalls.length ? { toolCalls } : {}),
      };
    } catch (err) {
      // Rethrown as-is: withFallback needs the real status to decide whether
      // another model could do better. Converting here erased it.
      throw err;
    }
  }

  async complete(request: CompletionRequest): Promise<CompletionResult> {
    return this.withFallback((model) => this.completeOnce(request, model));
  }

  private async completeOnce(
    request: CompletionRequest,
    model: string,
  ): Promise<CompletionResult> {
    const client = this.getClient();
    try {
      // `reasoning` is an OpenRouter extension not in the OpenAI SDK types, so
      // the body is assembled loosely and cast; the SDK forwards it verbatim.
      const body: Record<string, unknown> = {
        ...this.buildBody(request, model),
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

      const finishReason = response.choices[0]?.finish_reason;
      return {
        text,
        model: response.model,
        ...(finishReason ? { finishReason } : {}),
        ...(toolCalls?.length ? { toolCalls } : {}),
      };
    } catch (err) {
      throw err;
    }
  }

  /** Maps an SDK error to an AppError, surfacing the real cause of a connection failure. */
  private toAppError(err: unknown): AppError {
    if (err instanceof OpenAI.APIError) {
      const detail = (err.error as { message?: string } | undefined)?.message ?? err.message;
      // A connection failure carries no status; the reason is in the cause chain.
      const cause =
        err.status === undefined ? describeCause((err as { cause?: unknown }).cause) : '';

      // The full upstream text stays here, where it is useful for debugging.
      logger.error(
        `AI request failed (${err.status ?? 'network'}) model=${this.model} ` +
          `baseURL=${this.baseURL ?? 'default'}: ${detail}${cause ? ` | cause: ${cause}` : ''}`,
      );

      return new AppError(502, 'AI_PROVIDER_ERROR', userFacingMessage(err.status, detail));
    }
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    logger.error(`AI request failed: ${message}`);
    return new AppError(502, 'AI_PROVIDER_ERROR', 'The explanation service had a problem. Please try again.');
  }

}
