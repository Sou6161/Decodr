import { describe, expect, it, vi, beforeEach } from 'vitest';

const repo = { findById: vi.fn() };
const files = { listByRepository: vi.fn() };
const components = { listByRepository: vi.fn() };
const edges = { listByRepository: vi.fn() };
const routes = { listByRepository: vi.fn() };
const hooks = { listByRepository: vi.fn() };

vi.mock('../../repositories/repositoryRepository.js', () => ({ repositoryRepository: repo }));
vi.mock('../../repositories/fileRepository.js', () => ({ fileRepository: files }));
vi.mock('../../repositories/componentRepository.js', () => ({ componentRepository: components }));
vi.mock('../../repositories/edgeRepository.js', () => ({ edgeRepository: edges }));
vi.mock('../../repositories/routeRepository.js', () => ({ routeRepository: routes }));
vi.mock('../../repositories/hookRepository.js', () => ({ hookRepository: hooks }));

const { buildExplanationContext, CONTEXT_LIMITS } = await import('../contextBuilder.js');

const file = (id: string, path: string, content: string) => ({
  id,
  path,
  lineCount: content.split('\n').length,
  sizeBytes: content.length,
  content,
});
const comp = (id: string, name: string, fileId: string, path: string, importedByCount = 0) => ({
  id,
  name,
  fileId,
  importedByCount,
  file: { path },
});

beforeEach(() => {
  for (const m of [repo, files, components, edges, routes, hooks]) {
    for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  repo.findById.mockResolvedValue({ id: 'r', status: 'READY', storagePath: '/nowhere' });
  files.listByRepository.mockResolvedValue([
    file('f1', 'src/components/Dashboard.tsx', 'export function Dashboard() { return <div/>; }'),
    file('f2', 'src/hooks/useAuth.ts', 'export function useAuth() { return null; }'),
    file('f3', 'package.json', '{"dependencies":{"openai":"^4.0.0"}}'),
    file('f4', 'src/unrelated.ts', 'export const x = 1;'),
  ]);
  components.listByRepository.mockResolvedValue([
    comp('c1', 'Dashboard', 'f1', 'src/components/Dashboard.tsx', 3),
  ]);
  edges.listByRepository.mockResolvedValue([]);
  routes.listByRepository.mockResolvedValue([]);
  hooks.listByRepository.mockResolvedValue([{ name: 'useAuth', fileId: 'f2' }]);
});

const paths = (c: { files: { path: string }[] }) => c.files.map((f) => f.path);

describe('buildExplanationContext', () => {
  it('finds the component the question names', async () => {
    const c = await buildExplanationContext('r', 'explain the Dashboard', CONTEXT_LIMITS);
    expect(c.focusName).toBe('Dashboard');
    expect(paths(c)).toContain('src/components/Dashboard.tsx');
  });

  it('reads source from the database, not the disk', async () => {
    // storagePath points at a directory that does not exist.
    const c = await buildExplanationContext('r', 'explain the Dashboard', CONTEXT_LIMITS);
    expect(c.files[0]?.content).toContain('export function Dashboard');
  });

  it('pulls in the manifest for stack questions (regression: package.json was never sent)', async () => {
    const c = await buildExplanationContext('r', 'which AI does this use?', CONTEXT_LIMITS);
    expect(paths(c)).toContain('package.json');
  });

  it('keeps two-letter terms as keywords (regression: "AI" was dropped as noise)', async () => {
    const c = await buildExplanationContext('r', 'which AI is it using', CONTEXT_LIMITS);
    // With "ai" discarded there were zero keywords and this fell to a generic path.
    expect(c.files.length).toBeGreaterThan(0);
    expect(paths(c)).toContain('package.json');
  });

  it('includes a map naming every file, even ones not sent', async () => {
    const c = await buildExplanationContext('r', 'explain the Dashboard', CONTEXT_LIMITS);
    for (const p of ['src/components/Dashboard.tsx', 'src/hooks/useAuth.ts', 'src/unrelated.ts']) {
      expect(c.repoMap).toContain(p);
    }
    expect(paths(c)).not.toContain('src/unrelated.ts');
  });

  it('never exceeds the file budget', async () => {
    files.listByRepository.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => file(`f${i}`, `src/widget${i}.tsx`, 'export const a=1;')),
    );
    const c = await buildExplanationContext('r', 'explain widget', CONTEXT_LIMITS);
    expect(c.files.length).toBeLessThanOrEqual(CONTEXT_LIMITS.maxFiles);
  });

  it('refuses while the project is still processing', async () => {
    repo.findById.mockResolvedValue({ id: 'r', status: 'ANALYZING', storagePath: '/x' });
    await expect(buildExplanationContext('r', 'explain', CONTEXT_LIMITS)).rejects.toThrow(
      /still processing/i,
    );
  });

  it('404s for a repository that does not exist', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(buildExplanationContext('r', 'explain', CONTEXT_LIMITS)).rejects.toThrow(
      /not found/i,
    );
  });
});
