import { describe, expect, it } from 'vitest';
import { userFacingMessage } from '../providers/OpenAIProvider.js';

/** Nothing a provider says about itself should reach the reader. */
const LEAKS = /nvidia|openai|openrouter|azure|anthropic|gpt|nemotron|claude|gemini|model|upstream|baseurl/i;

describe('userFacingMessage', () => {
  it('does not leak the vendor from the real overload error', () => {
    const msg = userFacingMessage(undefined, 'Upstream error from Nvidia: Service temporarily overloaded');
    expect(msg).not.toMatch(LEAKS);
    expect(msg.length).toBeGreaterThan(10);
  });

  it('does not leak the model from a credits error', () => {
    const msg = userFacingMessage(
      402,
      'This request requires more credits. model=openai/gpt-4o-mini requested 9000 tokens',
    );
    expect(msg).not.toMatch(LEAKS);
  });

  it('tells the reader what to do, per failure kind', () => {
    expect(userFacingMessage(429, 'rate limit exceeded')).toMatch(/wait|again/i);
    expect(userFacingMessage(402, 'insufficient credits')).toMatch(/Quick|later/i);
    expect(userFacingMessage(401, 'invalid api key')).toMatch(/configured/i);
    expect(userFacingMessage(undefined, 'Connection error.')).toMatch(/reach/i);
    expect(userFacingMessage(503, 'service unavailable')).toMatch(/busy|again/i);
  });

  it('never leaks, whatever the upstream says', () => {
    for (const detail of [
      'Upstream error from Nvidia: Service temporarily overloaded',
      'openrouter.ai/api/v1 returned 500 for anthropic/claude-3',
      'nemotron-3-ultra-550b-a55b:free is overloaded',
      'Incorrect API key provided: sk-or-v1-abc123',
      '',
    ]) {
      for (const status of [undefined, 401, 402, 429, 500, 503, 400]) {
        expect(userFacingMessage(status, detail), `${status} / ${detail}`).not.toMatch(LEAKS);
      }
    }
  });
});
