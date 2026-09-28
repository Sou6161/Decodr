import { describe, expect, it, vi, beforeEach } from 'vitest';

const findByPaths = vi.fn();
vi.mock('../../repositories/fileRepository.js', () => ({
  fileRepository: { findByPaths: (...a: unknown[]) => findByPaths(...a) },
}));

const { runReadFiles, READ_FILES_TOOL } = await import('../fileReader.js');

beforeEach(() => findByPaths.mockReset());

describe('runReadFiles', () => {
  it('exposes a tool the model can call', () => {
    expect(READ_FILES_TOOL.name).toBe('read_files');
    expect(READ_FILES_TOOL.parameters).toHaveProperty('properties.paths');
  });

  it('returns file contents and records what was read', async () => {
    findByPaths.mockResolvedValue([{ path: 'a.ts', content: 'export const a = 1;' }]);
    const seen = new Set<string>();
    const r = await runReadFiles('repo', '{"paths":["a.ts"]}', seen, 10_000);
    expect(r.text).toContain('export const a = 1;');
    expect(r.paths).toEqual(['a.ts']);
    expect(seen.has('a.ts')).toBe(true);
  });

  it('never sends the same file twice', async () => {
    const seen = new Set(['a.ts']);
    const r = await runReadFiles('repo', '{"paths":["a.ts"]}', seen, 10_000);
    expect(findByPaths).not.toHaveBeenCalled();
    expect(r.paths).toEqual([]);
  });

  it('reports a path that does not exist instead of inventing one', async () => {
    findByPaths.mockResolvedValue([]);
    const r = await runReadFiles('repo', '{"paths":["nope.ts"]}', new Set(), 10_000);
    expect(r.text).toContain('not found');
    expect(r.paths).toEqual([]);
  });

  it('survives malformed arguments from the model', async () => {
    const r = await runReadFiles('repo', 'not json', new Set(), 10_000);
    expect(r.text).toContain('Could not parse');
    expect(r.paths).toEqual([]);
  });

  it('stops reading once the budget is exhausted', async () => {
    findByPaths.mockResolvedValue([
      { path: 'a.ts', content: 'x'.repeat(200) },
      { path: 'b.ts', content: 'y'.repeat(200) },
    ]);
    const r = await runReadFiles('repo', '{"paths":["a.ts","b.ts"]}', new Set(), 150);
    expect(r.paths).toEqual(['a.ts']);
    expect(r.text).toContain('context budget reached');
  });

  it('caps how many files one call may open', async () => {
    findByPaths.mockResolvedValue([]);
    const paths = Array.from({ length: 20 }, (_, i) => `f${i}.ts`);
    await runReadFiles('repo', JSON.stringify({ paths }), new Set(), 10_000);
    expect((findByPaths.mock.calls[0]?.[1] as string[]).length).toBe(6);
  });
});

describe('read budget accounting', () => {
  it('does not let one oversized file starve the rest silently', async () => {
    findByPaths.mockResolvedValue([
      { path: 'big.ts', content: 'x'.repeat(100_000) },
      { path: 'small.ts', content: 'y'.repeat(10) },
    ]);
    const r = await runReadFiles('repo', '{"paths":["big.ts","small.ts"]}', new Set(), 50_000);
    // The large file is truncated to the budget, and the caller can see which
    // paths actually made it in.
    expect(r.paths).toContain('big.ts');
    expect(r.text).toContain('truncated');
  });

  it('treats a null stored content as a missing file', async () => {
    findByPaths.mockResolvedValue([{ path: 'legacy.ts', content: null }]);
    const r = await runReadFiles('repo', '{"paths":["legacy.ts"]}', new Set(), 10_000);
    expect(r.text).toContain('not found');
    expect(r.paths).toEqual([]);
  });
});
