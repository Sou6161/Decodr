import { prisma } from '../database/prisma.js';
import type { ToolSpec } from './types.js';

/**
 * Tools that answer questions the file reader cannot.
 *
 * Retrieval picks files from keywords in the question, which misses whenever the
 * wording and the filenames disagree — "how do users log in?" will not surface
 * `session.ts`. These let the model go and look instead of guessing: search the
 * source text, follow the import graph, or jump straight to a definition. All
 * three read data the analysis step already stored, so none of them cost an
 * extra parse or an index.
 */

export const SEARCH_CODE_TOOL: ToolSpec = {
  name: 'search_code',
  description:
    'Search the full text of every file in the project for a string. Use this when ' +
    'you suspect something exists but do not know which file holds it — an API ' +
    'route, an env var, a library call, a prop name. Search for distinctive ' +
    'identifiers, not prose.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Literal text to look for, e.g. "socket.on" or "STRIPE_KEY".' },
    },
    required: ['query'],
  },
};

export const FIND_USAGES_TOOL: ToolSpec = {
  name: 'find_usages',
  description:
    'List the components that import or render a given component, and the ones it ' +
    'uses in turn. Use this for "where is X used?" and "what does X depend on?". ' +
    'Works for React components; for anything else it falls back to a source search.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact component name, e.g. "Header".' },
    },
    required: ['name'],
  },
};

export const GET_COMPONENT_TOOL: ToolSpec = {
  name: 'get_component',
  description:
    'Locate a component by name: which file defines it, which lines it occupies, ' +
    'and how widely it is used. Cheaper than opening a file when you only need ' +
    'to place something.',
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Exact component name.' },
    },
    required: ['name'],
  },
};

/** Files reported per search, and matches shown per file. */
const MAX_SEARCH_FILES = 12;
const MAX_MATCHES_PER_FILE = 4;

function parseArg(raw: string, key: string): string | null {
  try {
    const v = (JSON.parse(raw) as Record<string, unknown>)[key];
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Full-text search over stored source, reported as path:line with the line itself. */
export async function runSearchCode(repositoryId: string, rawArgs: string): Promise<string> {
  const query = parseArg(rawArgs, 'query');
  if (!query) return 'Pass {"query": "text to find"}.';

  const rows = await prisma.file.findMany({
    where: { repositoryId, content: { contains: query, mode: 'insensitive' } },
    select: { path: true, content: true },
    take: MAX_SEARCH_FILES,
  });
  if (rows.length === 0) return `No file contains "${query}".`;

  const needle = query.toLowerCase();
  const out: string[] = [`Files containing "${query}" (${rows.length}):`];
  for (const row of rows) {
    const lines = (row.content ?? '').split('\n');
    const hits: string[] = [];
    for (let i = 0; i < lines.length && hits.length < MAX_MATCHES_PER_FILE; i += 1) {
      if (lines[i]!.toLowerCase().includes(needle)) {
        hits.push(`  ${i + 1}: ${lines[i]!.trim().slice(0, 160)}`);
      }
    }
    out.push(`${row.path}\n${hits.join('\n')}`);
  }
  out.push('Open any of these with read_files to see the surrounding code.');
  return out.join('\n');
}

/** Both directions of the import graph around one component. */
export async function runFindUsages(repositoryId: string, rawArgs: string): Promise<string> {
  const name = parseArg(rawArgs, 'name');
  if (!name) return 'Pass {"name": "ComponentName"}.';

  const component = await prisma.component.findFirst({
    where: { repositoryId, name },
    include: { file: { select: { path: true } } },
  });

  // The graph only covers React components. Asked about a class, hook, helper or
  // type, this used to answer "no component named X" — which the model then
  // reported as "X isn't used anywhere". Fall back to searching the source so a
  // miss produces the real answer rather than a confident wrong one.
  if (!component) {
    const found = await runSearchCode(repositoryId, JSON.stringify({ query: name }));
    return (
      `"${name}" is not a React component, so it has no entry in the component graph. ` +
      `Here is where the name appears in the source instead:\n${found}`
    );
  }

  const [incoming, outgoing] = await Promise.all([
    prisma.componentEdge.findMany({
      where: { repositoryId, targetId: component.id },
      include: { source: { include: { file: { select: { path: true } } } } },
    }),
    prisma.componentEdge.findMany({
      where: { repositoryId, sourceId: component.id },
      include: { target: { include: { file: { select: { path: true } } } } },
    }),
  ]);

  const list = (items: { name: string; file: { path: string } }[]) =>
    items.length > 0
      ? items.map((c) => `  ${c.name} (${c.file.path})`).join('\n')
      : '  (none)';

  return [
    `${name} is defined in ${component.file.path}, lines ${component.startLine}-${component.endLine}.`,
    `Used by ${incoming.length} component(s):`,
    list(incoming.map((e) => e.source)),
    `Uses ${outgoing.length} component(s):`,
    list(outgoing.map((e) => e.target)),
  ].join('\n');
}

/** Where a component lives, without opening the file. */
export async function runGetComponent(repositoryId: string, rawArgs: string): Promise<string> {
  const name = parseArg(rawArgs, 'name');
  if (!name) return 'Pass {"name": "ComponentName"}.';

  const matches = await prisma.component.findMany({
    where: { repositoryId, name: { contains: name, mode: 'insensitive' } },
    include: { file: { select: { path: true } } },
    take: 8,
  });
  if (matches.length === 0) return `No component matching "${name}".`;

  return matches
    .map(
      (c) =>
        `${c.name} — ${c.file.path}:${c.startLine}-${c.endLine}` +
        ` · imported by ${c.importedByCount}` +
        (c.isExported ? ' · exported' : ''),
    )
    .join('\n');
}
