import { describe, expect, it } from 'vitest';
import { buildRepoMap, type RepoMapInput } from '../repoMap.js';

const comp = (name: string, path: string, importedByCount = 0) =>
  ({ name, importedByCount, file: { path } }) as RepoMapInput['components'][number];

const base: RepoMapInput = {
  files: [
    { path: 'src/App.tsx', lineCount: 40 },
    { path: 'src/components/Header.tsx', lineCount: 12 },
    { path: 'src/hooks/useCounter.ts', lineCount: 8 },
    { path: 'src/util.ts', lineCount: 3 },
  ],
  components: [comp('App', 'src/App.tsx'), comp('Header', 'src/components/Header.tsx', 2)],
  hooks: [{ name: 'useCounter', file: { path: 'src/hooks/useCounter.ts' } }],
  routes: [{ path: '/', filePath: 'src/App.tsx' }],
  imports: [{ from: 'src/App.tsx', to: 'src/components/Header.tsx' }],
};

describe('buildRepoMap', () => {
  it('lists every file, including ones that declare nothing', () => {
    const map = buildRepoMap(base);
    for (const f of base.files) expect(map).toContain(f.path);
  });

  it('shows declarations, import counts, routes and dependencies', () => {
    const map = buildRepoMap(base);
    expect(map).toContain('Header(2)'); // imported by 2
    expect(map).toContain('useCounter()'); // hooks marked with ()
    expect(map).toContain('[route /]');
    expect(map).toContain('-> src/components/Header.tsx');
  });

  it('is far smaller than the source it describes', () => {
    const map = buildRepoMap(base);
    const sourceLines = base.files.reduce((n, f) => n + f.lineCount, 0);
    expect(map.split('\n').length).toBeLessThan(sourceLines);
  });

  it('returns empty string for an empty project', () => {
    expect(buildRepoMap({ ...base, files: [] })).toBe('');
  });

  it('stays within budget on a large repo and says what it dropped', () => {
    const many: RepoMapInput = {
      ...base,
      files: Array.from({ length: 4000 }, (_, i) => ({
        path: `src/generated/module-with-a-fairly-long-name-${i}.tsx`,
        lineCount: 100,
      })),
      components: [],
      hooks: [],
      routes: [],
      imports: [],
    };
    const map = buildRepoMap(many);
    expect(map.length).toBeLessThanOrEqual(15_000);
    expect(map).toMatch(/more files omitted/);
  });

  it('keeps declaring files when the budget forces a choice', () => {
    const many: RepoMapInput = {
      files: [
        { path: 'src/Important.tsx', lineCount: 10 },
        ...Array.from({ length: 4000 }, (_, i) => ({
          path: `src/generated/filler-module-number-${i}.ts`,
          lineCount: 500,
        })),
      ],
      components: [comp('Important', 'src/Important.tsx', 9)],
      hooks: [],
      routes: [],
      imports: [],
    };
    expect(buildRepoMap(many)).toContain('Important(9)');
  });
});
