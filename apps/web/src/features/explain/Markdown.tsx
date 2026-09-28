import { Fragment, useState, type ReactNode } from 'react';

/**
 * Minimal, dependency-free markdown renderer for the subset the explanation
 * persona uses: paragraphs, headings, bullet/numbered lists, fenced code
 * blocks, inline `code`, and **bold**. Built by hand — no markdown library.
 */
export function Markdown({ content }: { content: string }) {
  // Spacing is set per block rather than with a uniform gap: a heading needs
  // room above it and little below, so it binds to the text it introduces.
  return (
    <div className="text-[14.5px] leading-7 text-foreground/90">{renderBlocks(content)}</div>
  );
}

/** True for a markdown table's |---|:--:| separator row. */
function isTableSeparator(line: string | undefined): boolean {
  if (!line) return false;
  const t = line.trim();
  return t.startsWith('|') && /^\|[\s:|-]+\|?$/.test(t) && t.includes('-');
}

/** Splits "| a | b |" into its cells, dropping the outer pipes. */
function splitRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

/**
 * A code sample with its language and a copy action.
 *
 * Copying matters here specifically: the whole point of an explanation is that
 * the reader goes and does something with the code, and hand-selecting from a
 * scrolling block is fiddly.
 */
function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked (permissions, insecure context); the code is
      // still selectable, so failing quietly is better than an error toast.
    }
  };

  return (
    <div className="group relative my-4 overflow-hidden rounded-xl border border-border-strong bg-[oklch(0.15_0.03_248)] shadow-sm shadow-black/30">
      <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-subtle">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-subtle opacity-0 transition-all hover:bg-surface-raised hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 font-mono text-[12.5px] leading-relaxed text-foreground/90">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function renderBlocks(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trim().slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        code.push(lines[i]!);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(<CodeBlock key={key++} code={code.join('\n')} lang={lang} />);
      continue;
    }

    // Blank line
    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // Heading
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push(
        <h4
          key={key++}
          className="mb-2 mt-6 text-[15.5px] font-semibold tracking-tight text-foreground first:mt-0"
        >
          {renderInline(heading[2]!)}
        </h4>,
      );
      i += 1;
      continue;
    }

    // Horizontal rule. Models use these as section dividers; without a branch
    // they rendered as a paragraph of literal dashes.
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      blocks.push(<hr key={key++} className="my-6 border-border" />);
      i += 1;
      continue;
    }

    // Blockquote — used for asides and warnings.
    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i]!)) {
        quoted.push(lines[i]!.replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-4 rounded-r border-l-2 border-primary/60 bg-surface-raised/40 py-2 pl-3.5 pr-3 text-muted"
        >
          {renderInline(quoted.join(' '))}
        </blockquote>,
      );
      continue;
    }

    // Table: a header row, a |---|---| separator, then body rows. Without this
    // the pipes fall through to the paragraph branch and collapse into one
    // unreadable run-on line.
    if (line.trimStart().startsWith('|') && isTableSeparator(lines[i + 1])) {
      const header = splitRow(line);
      i += 2; // header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trimStart().startsWith('|')) {
        rows.push(splitRow(lines[i]!));
        i += 1;
      }
      blocks.push(
        <div key={key++} className="my-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-border bg-surface-raised/60">
                {header.map((cell, c) => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-foreground">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b border-border/60 last:border-0">
                  {header.map((_, c) => (
                    <td key={c} className="px-3 py-2 align-top text-muted">
                      {renderInline(row[c] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Unordered list. Indentation is kept so nested bullets stay nested —
    // stripping it flattened hierarchical breakdowns into one level.
    if (/^\s*[-*]\s+/.test(line)) {
      const items: { text: string; depth: number; done?: boolean }[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        const raw = lines[i]!;
        const indent = /^(\s*)/.exec(raw)![1]!.replace(/\t/g, '  ').length;
        let text = raw.replace(/^\s*[-*]\s+/, '');
        // Task-list marker, if present.
        const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
        const done = task ? task[1] !== ' ' : undefined;
        if (task) text = task[2]!;
        items.push({ text, depth: Math.min(Math.floor(indent / 2), 3), ...(task ? { done } : {}) });
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="my-3.5 ml-1 space-y-2">
          {items.map((item, idx) => (
            <li
              key={idx}
              className="flex gap-2"
              style={item.depth > 0 ? { paddingLeft: `${item.depth * 1.1}rem` } : undefined}
            >
              {item.done === undefined ? (
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-subtle" />
              ) : (
                <span className="mt-0.5 shrink-0 text-[11px] text-primary">
                  {item.done ? '☑' : '☐'}
                </span>
              )}
              <span>{renderInline(item.text)}</span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol key={key++} className="my-3.5 ml-1 space-y-2">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2.5">
              <span className="text-xs font-medium tabular-nums text-subtle">{idx + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // Paragraph (gather consecutive plain lines)
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !lines[i]!.trimStart().startsWith('```') &&
      !/^(#{1,4})\s+/.test(lines[i]!) &&
      !/^\s*[-*]\s+/.test(lines[i]!) &&
      !/^\s*\d+\.\s+/.test(lines[i]!)
    ) {
      para.push(lines[i]!);
      i += 1;
    }
    blocks.push(
      <p key={key++} className="my-3.5 first:mt-0 last:mb-0">
        {renderInline(para.join(' '))}
      </p>,
    );
  }

  return blocks;
}

/** Inline formatting: `code` and **bold**. */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  // Order matters: code first so markup inside a snippet is left alone, then
  // bold before italic so `**x**` is not mistaken for two italics.
  const regex =
    /(`[^`]+`|\*\*[^*]+\*\*|~~[^~]+~~|\[[^\]]+\]\([^)\s]+\)|(?<![\w*])\*[^*\n]+\*(?![\w*])|(?<![\w_])_[^_\n]+_(?![\w_]))/g;
  let last = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(<Fragment key={key++}>{text.slice(last, match.index)}</Fragment>);
    const token = match[0];
    if (token.startsWith('`')) {
      parts.push(
        <code
          key={key++}
          className="rounded bg-surface-raised px-1 py-0.5 font-mono text-[0.8em] text-accent"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('~~')) {
      parts.push(
        <s key={key++} className="text-subtle">
          {token.slice(2, -2)}
        </s>,
      );
    } else if (token.startsWith('[')) {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      const href = m[2]!;
      // Only linkify schemes that are safe to click; anything else stays text
      // so a model cannot emit javascript: and have it rendered as a link.
      const safe = /^https?:\/\//i.test(href);
      parts.push(
        safe ? (
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2 hover:text-primary/80"
          >
            {m[1]}
          </a>
        ) : (
          <Fragment key={key++}>{m[1]}</Fragment>
        ),
      );
    } else if (token.startsWith('*') || token.startsWith('_')) {
      parts.push(
        <em key={key++} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else {
      parts.push(
        <strong key={key++} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return parts;
}
