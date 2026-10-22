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

  it('routes general programming questions to general', () => {
    for (const q of [
      'what is the difference between useMemo and useCallback',
      'useState vs useReducer',
      'how do i debounce an input',
      'write me a custom hook for fetching',
      'best practices for error boundaries',
      'should i use context or redux',
      'what are the trade-offs of server components',
      'give me an example of a generic type',
      'is tailwind better than css modules',
      'explain react server components',
      'write a regex for emails',
      'what is a monorepo',
    ]) {
      expect(classifyQuestion(q), q).toBe('general');
    }
  });

  it('keeps project-anchored questions on the code path', () => {
    // These all match a general-knowledge pattern too, so they are exactly the
    // cases where the general path would wrongly swallow a real code question.
    for (const q of [
      'how do i add a new route in this project',
      'what is the difference between the two layouts here',
      'where is the ProfileImage component',
      'how does our auth middleware work',
      'write me a test for apps/web/src/utils/cn.ts',
      'which file holds the rate limiter',
      'how do i use the useDashboard hook',
      // A named technology plus anything anchoring it to this repo stays code.
      'should i use zustand or redux here',
      'how do i deploy this to render',
    ]) {
      expect(classifyQuestion(q), q).toBe('code');
    }
  });
});
