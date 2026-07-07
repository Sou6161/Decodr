import { Fragment, type ReactNode } from 'react';

/**
 * Minimal, dependency-free markdown renderer for the subset the explanation
 * persona uses: paragraphs, headings, bullet/numbered lists, fenced code
 * blocks, inline `code`, and **bold**. Built by hand — no markdown library.
 */
export function Markdown({ content }: { content: string }) {
  return <div className="space-y-3 text-sm leading-relaxed text-foreground">{renderBlocks(content)}</div>;
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
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        code.push(lines[i]!);
        i += 1;
      }
      i += 1; // skip closing fence
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-lg border border-border-strong bg-[oklch(0.15_0.03_248)] p-3.5 font-mono text-[12.5px] leading-relaxed text-foreground/90 shadow-sm shadow-black/30"
        >
          <code>{code.join('\n')}</code>
        </pre>,
      );
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
        <h4 key={key++} className="pt-1 text-sm font-semibold text-foreground">
          {renderInline(heading[2]!)}
        </h4>,
      );
      i += 1;
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) {
        items.push(lines[i]!.replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={key++} className="ml-1 space-y-1.5">
          {items.map((item, idx) => (
            <li key={idx} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-subtle" />
              <span>{renderInline(item)}</span>
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
        <ol key={key++} className="ml-1 space-y-1.5">
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
      <p key={key++} className="text-muted">
        {renderInline(para.join(' '))}
      </p>,
    );
  }

  return blocks;
}

/** Inline formatting: `code` and **bold**. */
function renderInline(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
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
