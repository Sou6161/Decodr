import type { ComponentWithPath } from '../repositories/componentRepository.js';

/**
 * A compact index of an entire project.
 *
 * Retrieval only ever sends a handful of file bodies, which left the model blind
 * to everything it had not been handed — it could not say "that lives in
 * steam/library.tsx, which I can see but have not read". The map fixes that for
 * roughly 1% of the tokens the source itself would cost, because it is built
 * from structure already extracted at analysis time rather than from file text.
 *
 * Format, one line per file:
 *   app/settings.tsx (468L) :: SettingsScreen, useTheme() -> src/api/client.ts
 */

/** Hard ceiling on the map. Well under any mode's budget, but bounded for huge repos. */
const MAX_MAP_CHARS = 14_000;
/** Imports listed per file — enough to show coupling without bloating the line. */
const MAX_IMPORTS_PER_FILE = 4;

export interface RepoMapInput {
  files: { path: string; lineCount: number }[];
  components: ComponentWithPath[];
  hooks: { name: string; file: { path: string } }[];
  routes: { path: string; filePath: string }[];
  /** Resolved import edges between file paths. */
  imports: { from: string; to: string }[];
}

/** Groups values by a derived key, preserving insertion order. */
function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}

/**
 * Builds the map, densest files first so that if the budget runs out it is the
 * least informative entries (files declaring nothing) that get dropped.
 */
export function buildRepoMap(input: RepoMapInput): string {
  const { files, components, hooks, routes, imports } = input;
  if (files.length === 0) return '';

  const compsByFile = groupBy(components, (c) => c.file.path);
  const hooksByFile = groupBy(hooks, (h) => h.file.path);
  const importsByFile = groupBy(imports, (i) => i.from);
  const routeByFile = new Map(routes.map((r) => [r.filePath, r.path]));

  const entries = files.map((f) => {
    const declared = [
      ...(compsByFile.get(f.path) ?? []).map((c) =>
        c.importedByCount > 0 ? `${c.name}(${c.importedByCount})` : c.name,
      ),
      ...(hooksByFile.get(f.path) ?? []).map((h) => `${h.name}()`),
    ];
    const deps = [...new Set((importsByFile.get(f.path) ?? []).map((i) => i.to))].slice(
      0,
      MAX_IMPORTS_PER_FILE,
    );
    const route = routeByFile.get(f.path);

    let line = `${f.path} (${f.lineCount}L)`;
    if (route) line += ` [route ${route}]`;
    if (declared.length > 0) line += ` :: ${declared.join(', ')}`;
    if (deps.length > 0) line += ` -> ${deps.join(' ')}`;

    return { line, weight: declared.length * 100 + f.lineCount };
  });

  entries.sort((a, b) => b.weight - a.weight);

  const kept: string[] = [];
  let total = 0;
  let dropped = 0;
  for (const e of entries) {
    if (total + e.line.length + 1 > MAX_MAP_CHARS) {
      dropped += 1;
      continue;
    }
    kept.push(e.line);
    total += e.line.length + 1;
  }

  // Paths read better grouped by folder than by the density used for budgeting.
  kept.sort();
  const header =
    `PROJECT MAP — every file in the repository (${files.length} files). ` +
    'Format: path (lines) :: declarations -> imports. A number after a component ' +
    'is how many other components import it.';
  const footer =
    dropped > 0 ? `\n… and ${dropped} more files omitted for space.` : '';

  return `${header}\n${kept.join('\n')}${footer}`;
}
