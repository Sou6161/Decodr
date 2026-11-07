import { describe, expect, it, vi } from 'vitest';
import OpenAI, { APIUserAbortError } from 'openai';
import {
  freeQuotaResetAt,
  isAbort,
  OpenAIProvider,
  quotaExhaustedMessage,
  worthRetryingElsewhere,
} from '../providers/OpenAIProvider.js';
import { buildModelChain, LAST_RESORT_MODEL } from '../../config/env.js';

describe('worthRetryingElsewhere', () => {
  it('retries the failures another model could survive', () => {
    expect(worthRetryingElsewhere(429, new Error('rate limited'))).toBe(true);
    expect(worthRetryingElsewhere(402, new Error('out of credits'))).toBe(true);
    expect(worthRetryingElsewhere(503, new Error('overloaded'))).toBe(true);
    expect(worthRetryingElsewhere(500, new Error('boom'))).toBe(true);
    expect(worthRetryingElsewhere(undefined, new Error('Connection error.'))).toBe(true);
  });

  it('retries a model the gateway does not recognise', () => {
    // Returned as a 400, but the next model in the chain does not share it.
    expect(
      worthRetryingElsewhere(400, new Error('nonexistent/broken-model:free is not a valid model ID')),
    ).toBe(true);
    expect(worthRetryingElsewhere(404, new Error('model not found'))).toBe(true);
  });

  it('does not retry what is wrong everywhere', () => {
    // A bad key or malformed request fails identically on every model.
    expect(worthRetryingElsewhere(401, new Error('bad key'))).toBe(false);
    expect(worthRetryingElsewhere(403, new Error('forbidden'))).toBe(false);
    expect(worthRetryingElsewhere(400, new Error('messages: invalid role'))).toBe(false);
  });

  it('never retries a reader-initiated stop', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(worthRetryingElsewhere(undefined, abort)).toBe(false);
  });
});

describe('stopping an answer', () => {
  it('recognises the SDK’s own abort error, whose name is not "AbortError"', () => {
    // The original test above hand-built an error named AbortError, which the
    // SDK never actually throws. Its APIUserAbortError is named plain "Error",
    // so a real Stop was being classified as a network failure and retried.
    const real = new APIUserAbortError();
    expect(real.name).not.toBe('AbortError');
    expect(isAbort(real)).toBe(true);
    expect(worthRetryingElsewhere(undefined, real)).toBe(false);
  });

  /** A provider whose SDK client is replaced, so no network is involved. */
  function providerWith(create: (...a: unknown[]) => unknown) {
    const provider = new OpenAIProvider({ apiKey: 'test', model: 'primary', fallbacks: ['backup'] });
    (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    return provider;
  }

  it('rejects a stream the SDK ended quietly after an abort, without falling back', async () => {
    const controller = new AbortController();
    const create = vi.fn(async () => ({
      // Exactly what the SDK does: yield what arrived, then on abort simply END
      // the iteration rather than throwing.
      async *[Symbol.asyncIterator]() {
        yield { model: 'primary', choices: [{ delta: { content: 'The Counter keeps' } }] };
        controller.abort();
      },
    }));
    const provider = providerWith(create);
    const deltas: string[] = [];

    const outcome = provider
      .stream(
        { messages: [{ role: 'user', content: 'q' }], signal: controller.signal },
        { onDelta: (t) => deltas.push(t) },
      )
      .then(() => 'resolved', (err: unknown) => err);

    const err = await outcome;
    // Resolving here is the bug: the fragment was saved as a finished answer.
    expect(err).not.toBe('resolved');
    expect(isAbort(err)).toBe(true);
    expect(deltas).toEqual(['The Counter keeps']);
    expect(create).toHaveBeenCalledTimes(1); // the backup model was never tried
  });

  it('passes a thrown SDK abort straight through on the non-streaming path', async () => {
    const create = vi.fn(async () => {
      throw new APIUserAbortError();
    });
    const provider = providerWith(create);

    const err = await provider.complete({ messages: [{ role: 'user', content: 'q' }] }).catch((e) => e);

    expect(isAbort(err)).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

describe('the model chain', () => {
  it('always ends with the last-resort router on OpenRouter, even with no fallbacks configured', () => {
    // The production failure: AI_FALLBACK_MODELS unset, chain one paid model long.
    expect(buildModelChain('openai/gpt-4o-mini', '', 'https://openrouter.ai/api/v1')).toEqual([
      'openai/gpt-4o-mini',
      LAST_RESORT_MODEL,
    ]);
  });

  it('keeps configured fallbacks in order, with the router after them', () => {
    expect(buildModelChain('a', ' b , c ', 'https://openrouter.ai/api/v1')).toEqual(['a', 'b', 'c', LAST_RESORT_MODEL]);
  });

  it('does not add the router twice, or at all off OpenRouter', () => {
    expect(buildModelChain(LAST_RESORT_MODEL, '', 'https://openrouter.ai/api/v1')).toEqual([LAST_RESORT_MODEL]);
    expect(buildModelChain('gpt-4o-mini', '', 'https://api.openai.com/v1')).toEqual(['gpt-4o-mini']);
  });
});

describe('falling back between models', () => {
  const creditsError = () => new OpenAI.APIError(402, { message: 'requires more credits' }, 'requires more credits', new Headers());

  /** A provider whose SDK client records which model each call went to. */
  function chainProvider(fails: (model: string) => boolean) {
    const calls: { model: string; messages: unknown }[] = [];
    const create = vi.fn(async (body: { model: string; messages: unknown }) => {
      calls.push({ model: body.model, messages: body.messages });
      if (fails(body.model)) throw creditsError();
      return { model: body.model, choices: [{ message: { content: `answer from ${body.model}` }, finish_reason: 'stop' }] };
    });
    const provider = new OpenAIProvider({ apiKey: 'k', model: 'paid', fallbacks: ['free-a', 'free-b'] });
    (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    return { provider, calls };
  }

  it('hands the next model the WHOLE conversation, unchanged', async () => {
    const { provider, calls } = chainProvider((m) => m === 'paid');
    const messages = [
      { role: 'system' as const, content: 'persona' },
      { role: 'user' as const, content: 'earlier question' },
      { role: 'assistant' as const, content: 'earlier answer' },
      { role: 'user' as const, content: 'FILE: src/a.ts\n...\nQuestion: and now?' },
    ];

    const result = await provider.complete({ messages });

    expect(result.text).toBe('answer from free-a');
    expect(calls.map((c) => c.model)).toEqual(['paid', 'free-a']);
    // Same history, same files, same question — not a thinner retry.
    expect(calls[1]!.messages).toEqual(calls[0]!.messages);
  });

  it('stops trying a model first once it has run out of credits', async () => {
    const { provider, calls } = chainProvider((m) => m === 'paid');
    await provider.complete({ messages: [{ role: 'user', content: 'one' }] });
    calls.length = 0;

    await provider.complete({ messages: [{ role: 'user', content: 'two' }] });

    // One round trip, straight to the model that works.
    expect(calls.map((c) => c.model)).toEqual(['free-a']);
  });

  it('still tries every model, cooling ones included, before giving up', async () => {
    const { provider, calls } = chainProvider(() => true);
    await provider.complete({ messages: [{ role: 'user', content: 'q' }] }).catch(() => undefined);
    calls.length = 0;

    // Every model is now cooling down. A cooldown reorders; it never skips.
    await provider.complete({ messages: [{ role: 'user', content: 'q' }] }).catch(() => undefined);
    expect(calls.map((c) => c.model).sort()).toEqual(['free-a', 'free-b', 'paid']);
  });

  it('gives a recovered model its place back', async () => {
    let paidBroke = true;
    const { provider, calls } = chainProvider((m) => m === 'paid' && paidBroke);
    await provider.complete({ messages: [{ role: 'user', content: 'q' }] });
    paidBroke = false;
    // Force the cooldown to have expired.
    (provider as unknown as { coolingUntil: Map<string, number> }).coolingUntil.set('paid', 0);
    calls.length = 0;

    await provider.complete({ messages: [{ role: 'user', content: 'q' }] });
    expect(calls.map((c) => c.model)).toEqual(['paid']);
  });
});

describe('overlapping calls', () => {
  it('does not let a call that started before a failure clear that failure', async () => {
    // A nearly-broke model: small requests still go through, large ones get 402.
    const order: string[] = [];
    let releaseSmall!: () => void;
    const smallInFlight = new Promise<void>((r) => (releaseSmall = r));
    const create = vi.fn(async (body: { model: string; max_tokens: number }) => {
      order.push(`${body.model}:${body.max_tokens}`);
      if (body.model === 'paid' && body.max_tokens > 1000) {
        throw new OpenAI.APIError(402, { message: 'credits' }, 'credits', new Headers());
      }
      if (body.model === 'paid') await smallInFlight; // still running when the 402 lands
      return { model: body.model, choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };
    });
    const provider = new OpenAIProvider({ apiKey: 'k', model: 'paid', fallbacks: ['free'] });
    (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };

    // 1. A small background call starts on the paid model (nothing is cooling yet).
    const small = provider.complete({ messages: [{ role: 'user', content: 'follow-ups' }], maxTokens: 600 });
    // 2. A large answer fails on it and sets the cooldown.
    await provider.complete({ messages: [{ role: 'user', content: 'answer' }], maxTokens: 4000 });
    // 3. The small call now finishes successfully — AFTER the failure.
    releaseSmall();
    await small;
    order.length = 0;

    // 4. The next large answer must go straight to the free model.
    await provider.complete({ messages: [{ role: 'user', content: 'next answer' }], maxTokens: 4000 });
    expect(order).toEqual(['free:4000']);
  });
});

describe('the daily free-model quota', () => {
  const RESET = Date.UTC(2026, 10, 8); // midnight UTC, as OpenRouter reported
  /** The exact error OpenRouter returned once the free-tier quota was spent. */
  const quotaError = () =>
    OpenAI.APIError.generate(
      429,
      {
        error: {
          message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day',
          code: 429,
          metadata: { headers: { 'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(RESET) } },
        },
      },
      undefined,
      new Headers({ 'x-ratelimit-reset': String(RESET) }),
    );

  it('reads the reset time from the error, and ignores ordinary rate limits', () => {
    const now = RESET - 5 * 3_600_000;
    expect(freeQuotaResetAt(quotaError(), now)).toBe(RESET);
    const ordinary = OpenAI.APIError.generate(429, { error: { message: 'Rate limited, slow down' } }, undefined, new Headers());
    expect(freeQuotaResetAt(ordinary, now)).toBeNull();
  });

  it('tells the reader the real wait, in hours, without naming any provider', () => {
    const msg = quotaExhaustedMessage(RESET, RESET - 7.4 * 3_600_000);
    expect(msg).toContain('about 7 hours');
    expect(msg).not.toMatch(/openrouter|nvidia|openai|gpt|nemotron/i);
  });

  function provider(models: string[], fails: (m: string) => unknown) {
    const tried: string[] = [];
    const create = vi.fn(async (body: { model: string }) => {
      tried.push(body.model);
      const err = fails(body.model);
      if (err) throw err;
      return { model: body.model, choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }] };
    });
    const p = new OpenAIProvider({ apiKey: 'k', model: models[0]!, fallbacks: models.slice(1) });
    (p as unknown as { client: unknown }).client = { chat: { completions: { create } } };
    return { p, tried };
  }

  it('skips every other free model once one reports the quota spent — they share it', async () => {
    const { p, tried } = provider(['a:free', 'b:free', 'openrouter/free', 'paid'], (m) => (m === 'paid' ? null : quotaError()));

    const r = await p.complete({ messages: [{ role: 'user', content: 'q' }] });

    // One free model discovered the quota; the other two were never sent a
    // request that was certain to fail. The paid model answered.
    expect(tried).toEqual(['a:free', 'paid']);
    expect(r.model).toBe('paid');
  });

  it('answers with the quota message — and sends nothing — when only free models are left', async () => {
    const { p, tried } = provider(['a:free', 'openrouter/free'], () => quotaError());
    const first = await p.complete({ messages: [{ role: 'user', content: 'q' }] }).catch((e: unknown) => e);
    expect((first as { code?: string }).code).toBe('AI_QUOTA_EXHAUSTED');
    expect((first as Error).message).toMatch(/quota has been used up/);
    tried.length = 0;

    const second = await p.complete({ messages: [{ role: 'user', content: 'q' }] }).catch((e: unknown) => e);
    expect((second as { code?: string }).code).toBe('AI_QUOTA_EXHAUSTED');
    expect(tried).toEqual([]); // no doomed request at all
  });

  it('reports the quota, not the paid model’s credit error, when both are spent', async () => {
    const credits = () => OpenAI.APIError.generate(402, { error: { message: 'requires more credits' } }, undefined, new Headers());
    const { p } = provider(['paid', 'a:free'], (m) => (m === 'paid' ? credits() : quotaError()));
    const err = await p.complete({ messages: [{ role: 'user', content: 'q' }] }).catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('AI_QUOTA_EXHAUSTED');
  });
});
