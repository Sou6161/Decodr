import { describe, expect, it } from 'vitest';
import { extractMentions, mightReferenceFiles } from '../mentions.js';

const PATHS = [
  'src/App.tsx',
  'src/features/dashboard/DashboardPage.tsx',
  'src/features/explain/Markdown.tsx',
  'src/utils/cn.ts',
  'package.json',
];

describe('extractMentions', () => {
  it('resolves an @mention to a real path', () => {
    const { paths } = extractMentions('@src/App.tsx why does this rerender', PATHS);
    expect(paths).toEqual(['src/App.tsx']);
  });

  it('resolves a bare filename to the shortest matching path', () => {
    const { paths } = extractMentions('@cn.ts what does it do', PATHS);
    expect(paths).toEqual(['src/utils/cn.ts']);
  });

  it('keeps the order they were named in and drops duplicates', () => {
    const { paths } = extractMentions('compare @src/utils/cn.ts with @src/App.tsx and @cn.ts', PATHS);
    expect(paths).toEqual(['src/utils/cn.ts', 'src/App.tsx']);
  });

  it('ignores a mention that matches no file in the project', () => {
    const { paths } = extractMentions('@src/Nope.tsx explain this', PATHS);
    expect(paths).toEqual([]);
  });

  it('pulls file paths out of a pasted stack trace', () => {
    const trace = [
      "TypeError: Cannot read properties of undefined (reading 'map')",
      '    at DashboardPage (src/features/dashboard/DashboardPage.tsx:42:11)',
      '    at renderWithHooks (node_modules/react-dom/cjs/react-dom.js:1:1)',
    ].join('\n');
    const { paths, isError } = extractMentions(trace, PATHS);
    expect(isError).toBe(true);
    expect(paths).toContain('src/features/dashboard/DashboardPage.tsx');
  });

  it('reads a tsc diagnostic as an error', () => {
    const { paths, isError } = extractMentions(
      "src/utils/cn.ts(12,5): error TS2322: Type 'string' is not assignable",
      PATHS,
    );
    expect(isError).toBe(true);
    expect(paths).toEqual(['src/utils/cn.ts']);
  });

  it('does not mine paths out of an ordinary question', () => {
    // Without the error gate, any sentence naming a file would start pinning it
    // and the question would be answered about that file instead.
    const { paths, isError } = extractMentions(
      'which dependencies are in package.json and src/App.tsx',
      PATHS,
    );
    expect(isError).toBe(false);
    expect(paths).toEqual([]);
  });
});

describe('mightReferenceFiles', () => {
  it('is true for mentions and errors, false for plain questions', () => {
    expect(mightReferenceFiles('@src/App.tsx hey')).toBe(true);
    expect(mightReferenceFiles('TypeError: x is not a function')).toBe(true);
    expect(mightReferenceFiles('how does routing work')).toBe(false);
    expect(mightReferenceFiles('explain the Dashboard')).toBe(false);
  });
});
