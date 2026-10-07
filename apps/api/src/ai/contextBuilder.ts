import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ExplanationContext } from '@decodr/types';
import { RepositoryStatus } from '@decodr/types';
import { repositoryRepository } from '../repositories/repositoryRepository.js';
import { fileRepository } from '../repositories/fileRepository.js';
import { componentRepository } from '../repositories/componentRepository.js';
import type { ComponentWithPath } from '../repositories/componentRepository.js';
import { edgeRepository } from '../repositories/edgeRepository.js';
import { routeRepository } from '../repositories/routeRepository.js';
import { hookRepository } from '../repositories/hookRepository.js';
import { buildRepoMap } from './repoMap.js';
import { AppError } from '../utils/AppError.js';

/**
 * How much of the repo to send. Detailed mode goes wide; quick stays lean.
 * `maxTotalChars` is a hard ceiling across all files (~4 chars/token) so a big
 * project never overflows the model's context window.
 */
export interface ContextLimits {
  maxFiles: number;
  maxFileChars: number;
  maxTotalChars: number;
}
/**
 * One budget for every question.
 *
 * There used to be a Quick and a Detailed mode, which asked the reader to
 * predict how much context their own question needed — a judgement they are not
 * in a position to make, and which was wrong often enough to matter. This sits
 * between the two: enough for most questions in a single pass, and when it is
 * not, the model pulls more itself with read_files and search_code. That escape
 * hatch is why a large fixed budget is no longer worth paying for on every ask.
 *
 * ~110k chars ≈ 27k tokens, leaving room for the prompt and a long answer.
 */
export const CONTEXT_LIMITS: ContextLimits = {
  maxFiles: 14,
  maxFileChars: 12_000,
  maxTotalChars: 110_000,
};

const ROUTING_INTENT = /\b(rout(?:e|es|er|ing)|navigat\w*|url|pathname)\b/i;

/** Words that carry no signal about which part of the code the question is about. */
const STOPWORDS = new Set([
  'how', 'does', 'do', 'did', 'the', 'this', 'that', 'these', 'those', 'work',
  'works', 'working', 'feature', 'features', 'explain', 'what', 'why', 'who',
  'whom', 'are', 'and', 'for', 'with', 'component', 'components', 'function',
  'functions', 'file', 'files', 'code', 'use', 'used', 'uses', 'using', 'where',
  'when', 'which', 'show', 'please', 'tell', 'about', 'its', 'handle', 'handled',
  'implement', 'implemented', 'get', 'set', 'all', 'way', 'flow', 'inside',
  'part', 'here', 'they', 'them', 'from', 'into', 'your', 'you', 'can', 'give',
  // Two-letter noise — kept separate because the length floor is now 2, so that
  // domain terms like "ai", "ui", "db", "s3" survive.
  'is', 'it', 'of', 'to', 'in', 'on', 'at', 'be', 'by', 'or', 'as', 'an', 'if',
  'so', 'we', 'my', 'me', 'no', 'up', 'am', 'us', 'go', 'has', 'was', 'any',
]);

/**
 * Extracts meaningful lowercase keywords from a question.
 *
 * The length floor is 2, not 3: short technical terms carry the most signal in
 * questions like "which AI is it using" or "how does the DB work", and a 3-char
 * floor silently dropped every one of them — leaving zero keywords and sending
 * the question down the generic fallback path.
 */
function extractKeywords(question: string): string[] {
  return [
    ...new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w)),
    ),
  ];
}

/**
 * Questions about the stack ("which AI does it use", "what database", "which
 * libraries") are answered by the dependency manifest, not by component code.
 */
const STACK_INTENT =
  /\b(ai|llm|model|api|sdk|database|db|orm|librar\w*|dependenc\w*|package\w*|stack|tech|framework|auth|payment|hosting|deploy\w*|version)\b/i;

const MANIFEST_RE = /(^|\/)(package\.json|\.env\.example|\.env\.sample)$/i;

const fileBaseName = (p: string): string =>
  (p.split('/').pop() ?? '').replace(/\.\w+$/, '').toLowerCase();

/** Scores how well a component matches the question keywords (0 = no match). */
function scoreComponent(c: ComponentWithPath, keywords: string[]): number {
  const name = c.name.toLowerCase();
  const segs = c.file.path.toLowerCase().split('/');
  const base = fileBaseName(c.file.path);
  let s = 0;
  for (const k of keywords) {
    if (name === k) s += 12;
    else if (name.includes(k)) s += 7;
    else if (base.includes(k)) s += 5;
    else if (segs.some((seg) => seg === k)) s += 4;
    else if (segs.some((seg) => seg.includes(k))) s += 2;
  }
  return s > 0 ? s + Math.min(c.importedByCount, 10) * 0.1 : 0;
}

/** Scores how well a file path (folder/filename) matches the question keywords. */
function scoreFile(filePath: string, keywords: string[]): number {
  const segs = filePath.toLowerCase().split('/');
  const base = fileBaseName(filePath);
  let s = 0;
  for (const k of keywords) {
    if (segs.some((seg) => seg === k)) s += 6; // a folder literally named the keyword
    else if (base === k) s += 8;
    else if (base.includes(k)) s += 5;
    else if (segs.some((seg) => seg.includes(k))) s += 2;
  }
  return s;
}

/**
 * Builds a *focused* context for an explanation. It locates the component or
 * feature the question is about, pulls in its directly-related files (its own
 * file plus graph neighbors), and truncates everything to a token budget. The
 * whole repository is never included.
 */
export async function buildExplanationContext(
  repositoryId: string,
  question: string,
  limits: ContextLimits = CONTEXT_LIMITS,
): Promise<ExplanationContext> {
  const { maxFiles, maxFileChars, maxTotalChars } = limits;
  const repo = await repositoryRepository.findById(repositoryId);
  if (!repo) {
    throw AppError.notFound('Repository not found', 'REPOSITORY_NOT_FOUND');
  }
  if (repo.status !== RepositoryStatus.Ready) {
    throw AppError.badRequest('Repository is still processing. Try again once it is ready.');
  }

  const [allFiles, components, edges, routes, hooks] = await Promise.all([
    fileRepository.listByRepository(repositoryId),
    componentRepository.listByRepository(repositoryId),
    edgeRepository.listByRepository(repositoryId),
    routeRepository.listByRepository(repositoryId),
    hookRepository.listByRepository(repositoryId),
  ]);

  const fileById = new Map(allFiles.map((f) => [f.id, f.path]));
  const keywords = extractKeywords(question);

  // "Which AI / database / libraries does this use?" is answered by the manifest,
  // which no component name or folder path will ever match on keywords alone.
  // Front-load them so they survive the maxFiles cut.
  const manifestPaths = STACK_INTENT.test(question)
    ? allFiles
        .map((f) => f.path)
        .filter((p) => MANIFEST_RE.test(p))
        // Shallowest first: the root package.json describes the project, a
        // deeply-nested one describes a sub-package.
        .sort((a, b) => a.split('/').length - b.split('/').length)
        .slice(0, 4)
    : [];

  // Rank components and files by how well they match the question keywords.
  const scoredComponents = components
    .map((c) => ({ c, score: scoreComponent(c, keywords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const scoredFiles = allFiles
    .map((f) => ({ path: f.path, score: scoreFile(f.path, keywords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const focus = scoredComponents[0]?.c ?? null;

  let focusName: string | null = null;
  let guessed = false;
  let relatedComponents: string[] = [];
  let orderedPaths: string[] = [];

  if (keywords.length > 0 && (focus || scoredFiles.length > 0 || manifestPaths.length > 0)) {
    // Keyword-driven: the feature the user named (by component name or folder).
    focusName = focus?.name ?? capitalize(keywords[0]!);

    let neighborNames: string[] = [];
    const neighborPaths: string[] = [];
    if (focus) {
      const byId = new Map(components.map((c) => [c.id, c]));
      const outgoing = edges
        .filter((e) => e.sourceId === focus.id)
        .map((e) => byId.get(e.targetId))
        .filter((c): c is ComponentWithPath => Boolean(c));
      const incoming = edges
        .filter((e) => e.targetId === focus.id)
        .map((e) => byId.get(e.sourceId))
        .filter((c): c is ComponentWithPath => Boolean(c));
      neighborNames = unique([...outgoing, ...incoming].map((c) => c.name)).filter(
        (n) => n !== focus.name,
      );
      neighborPaths.push(...outgoing.map((c) => c.file.path), ...incoming.map((c) => c.file.path));
    }

    relatedComponents = unique([
      ...scoredComponents.slice(0, 5).map((x) => x.c.name),
      ...neighborNames,
    ]).filter((n) => n !== focusName);

    // Focus file, then the feature's folder files, then graph neighbors, then
    // other keyword-matched components.
    orderedPaths = unique([
      ...manifestPaths,
      ...(focus ? [focus.file.path] : []),
      ...scoredFiles.slice(0, maxFiles).map((x) => x.path),
      ...neighborPaths,
      ...scoredComponents.slice(1, maxFiles).map((x) => x.c.file.path),
    ]);
  } else if (ROUTING_INTENT.test(question)) {
    focusName = 'Routing';
    const routeFiles = unique(routes.map((r) => r.filePath));
    const targetNames = new Set(
      routes.map((r) => r.componentName).filter((n): n is string => Boolean(n)),
    );
    const targetFiles = components
      .filter((c) => targetNames.has(c.name))
      .map((c) => c.file.path);
    relatedComponents = [...targetNames];
    orderedPaths = unique([...routeFiles, ...targetFiles]);
  } else {
    // Nothing in the question identified a part of the code, so these files are
    // a guess at the project's centre — not an answer to what was asked. The
    // prompt is told as much, because silently explaining the most-imported
    // component is how "explain this file" came back about something unrelated.
    guessed = true;
    // General architecture question — lead with the most-imported hub components.
    const hubs = [...components]
      .sort((a, b) => b.importedByCount - a.importedByCount)
      .slice(0, maxFiles);
    relatedComponents = hubs.slice(0, 5).map((c) => c.name);
    orderedPaths = unique([
      ...hubs.map((c) => c.file.path),
      ...routes.map((r) => r.filePath),
    ]);
  }

  // Source text comes from the database first — the disk copy is ephemeral on
  // most hosts and disappears on redeploy.
  const contentByPath = new Map(
    allFiles.filter((f) => f.content !== null).map((f) => [f.path, f.content as string]),
  );

  const files = await readFiles(
    repo.storagePath,
    orderedPaths.slice(0, maxFiles),
    maxFileChars,
    maxTotalChars,
    contentByPath,
  );

  // Component edges are between components; collapse them to file-level imports
  // so each map line shows what that file actually depends on.
  const componentFile = new Map(components.map((c) => [c.id, c.file.path]));
  const fileImports = edges
    .map((e) => ({ from: componentFile.get(e.sourceId), to: componentFile.get(e.targetId) }))
    .filter((e): e is { from: string; to: string } => Boolean(e.from && e.to && e.from !== e.to));

  const hooksByPath = hooks
    .map((h) => {
      const path = fileById.get(h.fileId);
      return path ? { name: h.name, file: { path } } : null;
    })
    .filter((h): h is { name: string; file: { path: string } } => h !== null);

  const repoMap = buildRepoMap({
    files: allFiles.map((f) => ({ path: f.path, lineCount: f.lineCount })),
    components,
    hooks: hooksByPath,
    routes: routes.map((r) => ({ path: r.path, filePath: r.filePath })),
    imports: fileImports,
  });

  return { focusName, files, relatedComponents, repoMap, guessed };
}

/**
 * Reads files in relevance order, truncating each to `maxFileChars` and stopping
 * once the cumulative size hits `maxTotalChars` — so the context is as rich as
 * possible without ever exceeding the model's window.
 *
 * Stored content wins; the disk is only a fallback for rows saved before content
 * was persisted.
 */
async function readFiles(
  projectRoot: string,
  relativePaths: string[],
  maxFileChars: number,
  maxTotalChars: number,
  stored: Map<string, string>,
): Promise<ExplanationContext['files']> {
  const out: ExplanationContext['files'] = [];
  let total = 0;

  for (const relativePath of relativePaths) {
    if (total >= maxTotalChars) break;
    let content: string;
    const fromDb = stored.get(relativePath);
    if (fromDb !== undefined) {
      content = fromDb;
    } else {
      try {
        content = await readFile(path.join(projectRoot, relativePath), 'utf8');
      } catch {
        continue;
      }
    }
    const cap = Math.min(maxFileChars, maxTotalChars - total);
    const truncated = content.length > cap;
    if (truncated) content = content.slice(0, cap);
    out.push({ path: relativePath, content, truncated });
    total += content.length;
  }

  return out;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
