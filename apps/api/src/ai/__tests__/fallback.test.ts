import { describe, expect, it, vi } from 'vitest';
import { APIUserAbortError } from 'openai';
import { isAbort, OpenAIProvider, worthRetryingElsewhere } from '../providers/OpenAIProvider.js';

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
