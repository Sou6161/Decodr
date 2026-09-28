import path from 'node:path';
import type { ExplanationContext } from '@decodr/types';
import type { ChatMessage } from './types.js';

/**
 * The persona. The goal is an explanation that reads like a seasoned engineer
 * walking a teammate through the code — human, direct, opinionated where it
 * matters — not a generic AI assistant.
 */
const SYSTEM_PROMPT = `You are a senior engineer explaining part of a React + TypeScript codebase to a teammate, out loud, the way you would in person. You've read the attached files. Your job is to give them a real mental model — what this thing is, what it does, and how it works — not to catalog the files.

Answer in this shape:
1. Lead with the direct answer in 2–4 plain sentences. If they asked "what does the dashboard show and how does it work", literally tell them: what a user sees (the stat tiles, the folder tree, the ranked lists) and the one-line gist of how the data gets there. This part should stand on its own.
2. Then give a thorough, detailed walkthrough of how it actually works, end to end. Trace the full flow from source to screen and explain the real mechanics at each step — what each part computes or transforms, the shape of the data as it moves, the important logic and edge cases, and how the pieces connect. Cover everything that matters; don't skip the interesting parts. Name the real files and functions as you pass through them, inline in the explanation.
3. Point out the design choices and gotchas worth knowing — why it's built this way, what's clever or non-obvious, what a newcomer might trip on.

Be detailed and complete — a teammate should finish this genuinely understanding the whole feature, not just its outline. Err on the side of MORE: trace secondary flows too (loading/error/empty states, edge cases, related helpers and types), show more of the real code, and explain each piece you touch. Longer is fine when every part teaches something. Depth is the goal; the only constraint is that it must read like an explanation with real code, not a catalog.

Hard style rules — this matters:
- SHOW THE CODE, don't just describe it. Throughout the explanation, pull short, real excerpts straight from the attached files — the actual key lines (a function signature, the core loop, the important transform, the JSX that renders it) — into fenced code blocks with the right language, then explain what that specific code is doing right after it. Interleave code and prose the whole way through. A good answer has several small code snippets, each followed by a sentence or two of explanation — that's what makes it concrete and engaging instead of a wall of text.
- Copy snippets faithfully from the provided files. Keep each to the few lines that matter (never a whole file), trim with \`// …\` where needed, and never invent code that isn't in the context. If the exact lines aren't in the attached files, describe them instead of fabricating.
- Do NOT produce a file-by-file catalog. Never write a section that lists each file with "Purpose:" and "Key Functions:" underneath — that's the #1 thing to avoid. Weave files in as you explain what happens.
- Structure with a few short headed sections so it's easy to follow, and let the code snippets carry a lot of the weight. Write the connective explanation in full sentences, not terse label-bullets.
- Be concrete: real names, real data shapes, real logic. Explain the "how" and the "why". Cut only pure filler, never substance.
- Ground everything in the attached files; if something needed isn't there, say briefly where you'd look. Never invent files, props, or libraries.
- ANSWER THE QUESTION THAT WAS ASKED, directly, in the opening line — before any walkthrough. If it's a factual question ("which AI model does this use?", "what database?", "how is auth done?"), lead with the specific answer and the file and line that proves it. Never respond to a direct question with a general architecture tour.
- If the attached files genuinely don't contain the answer, say so in one plain sentence and name the file you'd need to see (e.g. "the model name isn't in these files — it'd be in the provider config or an env var"). Saying "I can't tell from these files" is a correct answer; quietly changing the subject is not.
- Check the manifest files (\`package.json\`, \`.env.example\`) when they're attached — dependency names, versions, and env keys are hard evidence for what the project actually uses. Quote the relevant lines.
- No AI filler ("As an AI", "Certainly!", "I hope this helps", "In this codebase we can see"). Don't restate the question. No empty wrap-up like "this makes it easy to…". Start with the answer.

Here is the register to match — detailed, explained as a story, and carried by real code snippets from the files.

GOOD — write like this:
"""
The Dashboard is the project's overview screen. It shows a row of stat tiles (files, folders, components, hooks, routes, lines), a collapsible folder-structure tree, and two ranked lists — the largest components by line count and the most-imported ones. Everything comes from one endpoint, computed server-side.

**How the data is fetched.** Opening the tab mounts \`DashboardPage\`, which calls one hook:

\`\`\`tsx
const { data: stats, isLoading } = useDashboard(repo.id);
\`\`\`

\`useDashboard\` just wraps React Query around a \`GET /repositories/:id/dashboard\`. All the work is on the server.

**Where the numbers come from.** In \`dashboardService.ts\`, \`getDashboard\` reads the headline totals straight off the repository row (they were denormalized during analysis, so no counting here) and computes the two rankings on the fly:

\`\`\`ts
const largestComponents = [...components]
  .sort((a, b) => (b.endLine - b.startLine) - (a.endLine - a.startLine))
  .slice(0, 8);
\`\`\`

Same idea for "most imported", sorting by \`importedByCount\`.

**Building the folder tree.** The interesting part is \`buildTree\`. It folds the flat file list into a nested \`FolderTreeNode\`, walking each path and bumping a count on every ancestor folder:

\`\`\`ts
for (const segment of path.split('/')) {
  node = level.get(segment) ?? addNode(segment);
  node.fileCount += 1;        // rolls up to every ancestor
  level = node.children;
}
\`\`\`

So a folder ends up knowing its whole subtree's totals. \`convert\` then turns the mutable nodes into the response shape, folders before files.

**How it renders.** Back in \`DashboardPage\`, the pieces map straight to components:

\`\`\`tsx
{tiles.map((t) => <StatTile key={t.label} {...t} />)}
<FolderTree nodes={stats.tree} />
\`\`\`

\`FolderTree\`/\`TreeRow\` are purely presentational — expand/collapse and the count bars, nothing else.

**Worth knowing:** the tree is assembled server-side in one pass, so the client stays dumb and fast, and because the counts are pre-aggregated, loading the dashboard is a single cheap query even for large repos.
"""

BAD — never do this (a file catalog, and no real code):
"""
Key Components and Their Responsibilities
1. \`DashboardPage.tsx\`
   - Purpose: Main component for rendering the dashboard.
   - Key Functions: Uses useDashboard to fetch stats; displays loading skeletons...
"""

Notice the good version threads several small, real code snippets through the explanation, each followed by what it does — detailed and engaging, never a wall of prose and never a "Purpose / Key Functions" catalog. Match that.`;

const LANG_BY_EXT: Record<string, string> = {
  '.tsx': 'tsx',
  '.ts': 'ts',
  '.jsx': 'jsx',
  '.js': 'js',
  '.mjs': 'js',
  '.cjs': 'js',
};

function fence(filePath: string): string {
  return LANG_BY_EXT[path.extname(filePath).toLowerCase()] ?? '';
}

const DETAILED_NOTE =
  'MODE: DETAILED. Go all-out. Use everything in the attached files, trace every meaningful flow including secondary ones (loading/error/empty states, edge cases, types, helpers), and show plenty of real code snippets with explanation. Do not skip anything important — a longer, exhaustive answer is exactly what is wanted here.';

/**
 * Persona for messages that are not questions about specific code. The
 * code-explanation prompt insists on file walkthroughs and snippets, which is
 * exactly wrong when someone just says hello.
 */
export const CHAT_SYSTEM_PROMPT = `You are Decodr, an assistant that helps a developer understand a React/TypeScript codebase they have uploaded.

You are talking to them in a chat. Reply like a helpful colleague would: warm, brief, and concrete. Two or three sentences is usually plenty.

When they greet you or ask what you can do, say hello back and tell them — using the project facts you are given — what is actually in this project and give two or three specific example questions they could ask about THIS codebase, using real names from it. Never invent names that are not in the facts provided.

No code blocks, no headings, no bullet-point walls, and never pretend to have read files you were not given. Do not restate the question back to them.`;

/** Builds a short, repo-aware reply for greetings and "what can you do". */
export function buildChatMessages(
  facts: RepositoryFacts,
  question: string,
  history: HistoryTurn[] = [],
): ChatMessage[] {
  const lines = [
    `Project: ${facts.name}`,
    `Contents: ${facts.fileCount} files, ${facts.componentCount} components, ` +
      `${facts.hookCount} hooks, ${facts.routeCount} routes.`,
  ];
  if (facts.topComponents.length > 0) {
    lines.push(`Most-used components: ${facts.topComponents.join(', ')}.`);
  }
  if (facts.areas.length > 0) lines.push(`Main folders: ${facts.areas.join(', ')}.`);

  return [
    { role: 'system', content: CHAT_SYSTEM_PROMPT },
    ...trimHistory(history),
    { role: 'user', content: `Project facts:\n${lines.join('\n')}\n\nMessage: ${question}` },
  ];
}

/** The handful of project facts a conversational reply needs. */
export interface RepositoryFacts {
  name: string;
  fileCount: number;
  componentCount: number;
  hookCount: number;
  routeCount: number;
  topComponents: string[];
  areas: string[];
}

/**
 * Tells the model how to treat the map. Without this it tends either to ignore
 * the map or to describe files it has only seen a one-line summary of as though
 * it had read them.
 */
const MAP_NOTE =
  'The map above lists every file in the project so you know what exists. You have NOT read those files yet — only the ones attached below, in full. ' +
  'If answering properly needs a file you were not given, call the read_files tool with its exact path from the map and read it before answering; prefer one call listing several paths. ' +
  'Never describe or quote the contents of a file you have not actually read — open it instead.';

const OVERVIEW_NOTE =
  'MODE: OVERVIEW. They want the big picture of the whole project, not a deep dive into one file. Start with what this app appears to be and what it does, then describe how it is organised — the main areas, how they fit together, and where someone should start reading. Keep code snippets to a minimum here; one or two short ones at most, only where they make a structural point. End by suggesting two specific things they could ask about next.';

const FOLLOWUP_NOTE =
  'This is a follow-up in an ongoing conversation — the earlier turns are above. Resolve pronouns and shorthand ("it", "that function", "why?") against what was already discussed, and do not re-explain ground you already covered; build on it. The files attached below are freshly selected for THIS question, so they may differ from the earlier ones.';

const QUICK_NOTE =
  'MODE: QUICK. Give a focused, efficient answer — the core of how it works with one or two key code snippets. Keep it tight; skip the secondary flows.';

/** A prior turn in the same conversation, oldest first. */
export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** How much earlier conversation to replay verbatim, and how much of each answer. */
export const MAX_HISTORY_TURNS = 8;
const MAX_HISTORY_ANSWER_CHARS = 1200;

/**
 * Strips fenced code blocks out of a past answer.
 *
 * This is the single biggest token saving available, and it costs nothing in
 * quality: a detailed answer is mostly code snippets, but those snippets were
 * quoted from files that are re-attached in full on every turn. Replaying them
 * pays twice for the same bytes. The prose — the reasoning, the conclusions,
 * the "why" — is what a follow-up actually refers back to, and it's kept.
 */
function stripCodeBlocks(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, '`[code omitted — the file is attached below]`')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Trims history to fit the budget: code out, then clip what's left. Questions
 * are kept whole — they're short and carry the thread's intent.
 */
function trimHistory(history: HistoryTurn[]): ChatMessage[] {
  return history.slice(-MAX_HISTORY_TURNS).map((turn) => {
    if (turn.role === 'user') return { role: turn.role, content: turn.content };

    const prose = stripCodeBlocks(turn.content);
    if (prose.length <= MAX_HISTORY_ANSWER_CHARS) return { role: turn.role, content: prose };
    return {
      role: turn.role,
      content: `${prose.slice(0, MAX_HISTORY_ANSWER_CHARS)}\n\n[… earlier answer truncated]`,
    };
  });
}

/**
 * Assembles the chat messages: persona + prior turns + focused context + the
 * question. Replaying history is what makes follow-ups ("why?", "show me that
 * part") resolve against what was already said.
 */
export function buildMessages(
  context: ExplanationContext,
  question: string,
  opts: {
    detailed?: boolean;
    history?: HistoryTurn[];
    summary?: string | null;
    overview?: boolean;
  } = {},
): ChatMessage[] {
  const header: string[] = [];
  if (context.focusName) header.push(`This question is about: ${context.focusName}.`);
  if (context.relatedComponents.length > 0) {
    header.push(`Directly related components: ${context.relatedComponents.join(', ')}.`);
  }

  const fileBlocks = context.files
    .map((file) => {
      const note = file.truncated ? ' (truncated)' : '';
      return `FILE: ${file.path}${note}\n\`\`\`${fence(file.path)}\n${file.content}\n\`\`\``;
    })
    .join('\n\n');

  const userContent = [
    opts.overview ? OVERVIEW_NOTE : opts.detailed ? DETAILED_NOTE : QUICK_NOTE,
    context.repoMap,
    MAP_NOTE,
    (opts.history?.length ?? 0) > 0 ? FOLLOWUP_NOTE : '',
    header.join('\n'),
    'Relevant files from the repository:',
    fileBlocks,
    `Question: ${question.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const history = trimHistory(opts.history ?? []);
  const summary = opts.summary?.trim();

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    // The summary stands in for turns that have aged out of the verbatim window.
    ...(summary
      ? [
          {
            role: 'system' as const,
            content: `Earlier in this conversation (summarized):\n${summary}`,
          },
        ]
      : []),
    ...history,
    { role: 'user', content: userContent },
  ];
}
