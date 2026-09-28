import { describe, expect, it } from 'vitest';
import { classifyQuestion } from '../intent.js';

describe('classifyQuestion', () => {
  it('treats bare greetings as smalltalk', () => {
    for (const q of ['hi', 'hi there', 'hello everyone', 'hey', 'thanks!', 'ok']) {
      expect(classifyQuestion(q), q).toBe('smalltalk');
    }
  });

  it('handles any term of address after a greeting', () => {
    // Listing these words one by one was a losing game — "man" and "dude" were
    // both missed at first, and a greeting reached the code-explanation path.
    for (const q of ['hi man', 'hey dude', 'hello buddy', 'hi bro', 'yo man', 'hi sir']) {
      expect(classifyQuestion(q), q).toBe('smalltalk');
    }
  });

  it('still routes a greeting followed by an actual request to code', () => {
    expect(classifyQuestion('hi explain routing')).toBe('code');
    expect(classifyQuestion('hey show me the router')).toBe('code');
  });

  it('treats questions about the assistant as smalltalk', () => {
    expect(classifyQuestion('what can you do')).toBe('smalltalk');
    expect(classifyQuestion('who are you')).toBe('smalltalk');
  });

  it('does not swallow a real question that starts with a greeting', () => {
    expect(classifyQuestion('hi, can you explain the router?')).toBe('code');
  });

  it('routes whole-project questions to overview', () => {
    for (const q of [
      'give me an overview',
      'what is this project',
      'where do i start',
      'summarize the codebase',
    ]) {
      expect(classifyQuestion(q), q).toBe('overview');
    }
  });

  it('routes specific questions to code', () => {
    for (const q of ['explain the Dashboard', 'how does routing work', 'which AI does it use']) {
      expect(classifyQuestion(q), q).toBe('code');
    }
  });
});
