import { describe, expect, it } from 'vitest';
import { worthRetryingElsewhere } from '../providers/OpenAIProvider.js';

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
