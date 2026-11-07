import OpenAI, { APIUserAbortError } from 'openai';
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
    return 'The explanation service is unavailable right now. Please try again later.';
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
  if (status === undefined) return !isAbort(err);
  return false;
}

/**
 * Whether a model draws on the account's shared free-request quota. Every
 * `:free` model does, and so does OpenRouter's free router.
 */
export function isFreeModel(model: string): boolean {
  return model.endsWith(':free') || model === 'openrouter/free';
}

/**
 * When the account's daily free-model quota resets, if this error says it is
 * used up; otherwise null.
 *
 * This is not an ordinary rate limit. OpenRouter caps free-model requests per
 * ACCOUNT per day — 50 on a free-tier account — and every free model draws on
 * the same allowance. Once it is gone, trying the next free model in the chain
 * is a guaranteed failure, and so is every retry until the reset.
 */
export function freeQuotaResetAt(err: unknown, now = Date.now()): number | null {
  if (!(err instanceof OpenAI.APIError) || err.status !== 429) return null;
  const body = err.error as
    | { message?: string; metadata?: { headers?: Record<string, string> } }
    | undefined;
  if (!/free-models-per-day/i.test(`${body?.message ?? ''} ${err.message}`)) return null;

  const raw =
    (err.headers as Headers | undefined)?.get?.('x-ratelimit-reset') ??
    body?.metadata?.headers?.['X-RateLimit-Reset'];
  const reset = Number(raw);
  if (Number.isFinite(reset) && reset > now) return reset;
  // No usable header: the cap is per UTC day, so it resets at the next midnight.
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

/** What the reader is told when the day's free quota is spent. */
export function quotaExhaustedMessage(resetsAt: number, now = Date.now()): string {
  const hours = Math.max(1, Math.round((resetsAt - now) / 3_600_000));
  return (
    "Today's AI quota has been used up, so questions can't be answered right now. " +
    `It resets in about ${hours} hour${hours === 1 ? '' : 's'}.`
  );
}

/**
 * How long a failed model goes to the back of the queue.
 *
 * Scaled to how long the cause usually lasts. Exhausted credits and a withdrawn
 * model do not recover in seconds; a rate limit or an overloaded pool often
 * does. A model in cooldown is still tried as a last resort, so getting these
 * too long costs latency on a recovered model, never a failed request.
 */
export function cooldownFor(status: number | undefined): number {
  if (status === 402) return 10 * 60_000; // out of credits
  if (status === 404 || status === 400) return 30 * 60_000; // model withdrawn or unknown
  if (status === 429) return 60_000; // rate limited
  return 20_000; // overloaded, 5xx, or a dropped connection
}

/**
 * Whether an error is the caller stopping the request on purpose.
 *
 * Checking `name === 'AbortError'` alone was not enough: the OpenAI SDK throws
 * its own `APIUserAbortError`, whose name is plain "Error". A reader pressing
 * Stop was therefore classified as a connection failure and retried on the next
 * model in the chain — stopping an answer could walk every fallback in turn.
 */
export function isAbort(err: unknown): boolean {
  return (
    err instanceof APIUserAbortError ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

/** The error a stopped request rejects with, so every caller sees one shape. */
export function abortError(): Error {
  return Object.assign(new Error('The request was stopped.'), { name: 'AbortError' });
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
  /**
   * When each recently failed model may be tried first again.
   *
   * Without this, a model that is out of credits or withdrawn was retried FIRST
   * on every call — and one question makes several calls (tool rounds, the
   * answer, its follow-ups, the thread title). Each paid a doomed round trip
   * before reaching a model that works.
   */
  private readonly coolingUntil = new Map<string, number>();
  /** When each model last failed, so a stale success cannot undo a fresh failure. */
  private readonly failedAt = new Map<string, number>();
  /**
   * Until when every free model is unusable because the account's daily free
   * quota is spent. Unlike a cooldown this SKIPS models rather than reordering
   * them: the reset time is known, and each attempt before it is a certain loss.
   */
  private freeQuotaResetsAt = 0;

  /** True while the account has no free requests left today. */
  private quotaBlocks(model: string, now = Date.now()): boolean {
    return isFreeModel(model) && this.freeQuotaResetsAt > now;
  }

  /** The reader-facing error for a spent daily quota. */
  private quotaError(): AppError {
    return new AppError(429, 'AI_QUOTA_EXHAUSTED', quotaExhaustedMessage(this.freeQuotaResetsAt));
  }

  /**
   * Models in the order to try them: those not cooling down first, in chain
   * order, then the cooling ones. Cooling models are tried LAST rather than
   * skipped, so an outage of every model still gets every model attempted —
   * the cooldown only reorders, it never makes a request fail untried.
   */
  private attemptOrder(now = Date.now()): string[] {
    const usable = this.chain.filter((m) => !this.quotaBlocks(m, now));
    const ready = usable.filter((m) => (this.coolingUntil.get(m) ?? 0) <= now);
    const cooling = usable.filter((m) => (this.coolingUntil.get(m) ?? 0) > now);
    return [...ready, ...cooling];
  }

  /**
   * Runs an attempt against each model in turn, moving on when the failure is
   * one a different model could survive.
   *
   * Every model receives the SAME request — the full conversation, the attached
   * files, every tool result so far — so a fallback picks up exactly where the
   * failed model was, rather than starting a thinner conversation.
   *
   * A bad key or a malformed request will fail identically everywhere, so those
   * stop immediately — retrying them would only multiply the latency. Overload,
   * rate limits, exhausted credits and withdrawn models are specific to one
   * model or its pool, and those are exactly what the free shared pools produce.
   */
  private async withFallback(
    attempt: (model: string) => Promise<CompletionResult>,
    /** Called before a retry, so a partly-streamed answer can be discarded. */
    onRestart?: () => void,
  ): Promise<CompletionResult> {
    let lastError: unknown;
    let lastModel = this.chain[0]!;
    const order = this.attemptOrder();
    // Every model is free and the quota is spent: answer at once, without
    // sending a request that is certain to be refused.
    if (order.length === 0) throw this.quotaError();

    for (const [index, model] of order.entries()) {
      // An earlier model in THIS call may have just discovered the quota is gone.
      if (this.quotaBlocks(model)) continue;
      const startedAt = Date.now();
      try {
        const result = await attempt(model);
        // Only a request that began AFTER the model's last failure proves it has
        // recovered. Calls overlap — a question's follow-ups run alongside the
        // next question — and a model that is nearly out of credits still
        // completes small requests while refusing large ones. A small call that
        // started first and finished later was clearing the cooldown a large
        // call had just set, so every answer went back to paying a 402.
        if ((this.failedAt.get(model) ?? 0) < startedAt) {
          this.coolingUntil.delete(model);
          this.failedAt.delete(model);
        }
        if (model !== this.chain[0]) {
          logger.info(`AI answered with ${model} (primary: ${this.chain[0]})`);
        }
        return result;
      } catch (err) {
        // A stop is not a failure: no other model should be tried, and it must
        // not be dressed up as an "AI request failed" error and logged as one.
        if (isAbort(err)) throw abortError();
        lastError = err;
        lastModel = model;
        const status = err instanceof OpenAI.APIError ? err.status : undefined;
        if (!worthRetryingElsewhere(status, err)) throw this.toAppError(err, model);

        const quotaReset = freeQuotaResetAt(err);
        if (quotaReset !== null) {
          this.freeQuotaResetsAt = quotaReset;
          logger.warn(
            `AI free-model quota for today is spent; free models are skipped until ` +
              `${new Date(quotaReset).toISOString()}`,
          );
        } else {
          const cooldown = cooldownFor(status);
          this.coolingUntil.set(model, Date.now() + cooldown);
          this.failedAt.set(model, Date.now());
        }

        const next = order.slice(index + 1).find((m) => !this.quotaBlocks(m));
        if (!next) break;
        logger.warn(
          `AI model ${model} failed (${status ?? 'network'}); trying ${next}` +
            (quotaReset === null
              ? ` — ${model} is skipped for ${Math.round(cooldownFor(status) / 1000)}s`
              : ''),
        );
        onRestart?.();
      }
    }

    // Out of models. When the free quota is part of why, that is the honest
    // explanation: "wait a moment" is wrong when the wait is until tomorrow.
    if (this.freeQuotaResetsAt > Date.now()) {
      this.toAppError(lastError, lastModel); // logs the upstream detail
      throw this.quotaError();
    }
    throw this.toAppError(lastError, lastModel);
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

      // A streamed tool call is dropped only when it has no NAME — without one
      // there is nothing to dispatch. A missing id is survivable: it exists to
      // pair the result message back to the call, so any stable stand-in works,
      // and some providers never send one. Requiring it meant the model asked
      // to read a file, the request was silently discarded, and the answer came
      // back built on whatever it had already guessed.
      // The SDK ends the iteration QUIETLY when the request is aborted, instead
      // of throwing. Returned as-is, a stopped answer was indistinguishable from
      // a finished one: it was saved without its "stopped" marker, as though the
      // model had chosen to end there, and a title and follow-ups were then
      // generated for the fragment. Stopping is not finishing; say so.
      if (request.signal?.aborted) throw abortError();

      const toolCalls: ToolCall[] = [...partial.entries()]
        .filter(([, c]) => c.name)
        .map(([index, c]) => ({ ...c, id: c.id || `call_${index}` }));
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
      const toolCalls = rawCalls
        ?.filter((c) => c.function?.name)
        .map((c, i) => ({
          id: c.id || `call_${i}`,
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
  private toAppError(err: unknown, model: string = this.model): AppError {
    if (err instanceof OpenAI.APIError) {
      const detail = (err.error as { message?: string } | undefined)?.message ?? err.message;
      // A connection failure carries no status; the reason is in the cause chain.
      const cause =
        err.status === undefined ? describeCause((err as { cause?: unknown }).cause) : '';

      // The full upstream text stays here, where it is useful for debugging.
      logger.error(
        `AI request failed (${err.status ?? 'network'}) model=${model} ` +
          `baseURL=${this.baseURL ?? 'default'}: ${detail}${cause ? ` | cause: ${cause}` : ''}`,
      );

      return new AppError(502, 'AI_PROVIDER_ERROR', userFacingMessage(err.status, detail));
    }
    const message = err instanceof Error ? err.message : 'Unknown AI error';
    logger.error(`AI request failed: ${message}`);
    return new AppError(502, 'AI_PROVIDER_ERROR', 'The explanation service had a problem. Please try again.');
  }

}
