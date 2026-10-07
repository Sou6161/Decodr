import { useState } from 'react';
import type { Message } from '@decodr/types';
import { MessageRole } from '@decodr/types';
import { Badge, Card } from '@/components/ui';
import { Markdown } from './Markdown';
import { cn } from '@/utils/cn';

const CONTEXT_PREVIEW = 5;

export function ChatMessages({
  messages,
  onEdit,
  onRegenerate,
}: {
  messages: Message[];
  /** Puts a past question back in the composer so it can be reworded and re-asked. */
  onEdit?: (content: string) => void;
  /** Re-asks the question that produced the last answer. */
  onRegenerate?: (question: string) => void;
}) {
  return (
    <div className="space-y-6">
      {messages.map((message) =>
        message.role === MessageRole.User ? (
          <UserBubble key={message.id} content={message.content} {...(onEdit ? { onEdit } : {})} />
        ) : (
          <AssistantCard
            key={message.id}
            message={message}
            {...(onRegenerate && message.id === messages[messages.length - 1]?.id
              ? { onRegenerate: () => onRegenerate(lastQuestionBefore(messages, message.id)) }
              : {})}
          />
        ),
      )}
    </div>
  );
}

/** The question that produced a given answer, for regenerating it. */
function lastQuestionBefore(messages: Message[], answerId: string): string {
  const idx = messages.findIndex((m) => m.id === answerId);
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (messages[i]!.role === MessageRole.User) return messages[i]!.content;
  }
  return '';
}

/** Copy / edit actions that appear on hover, as in a normal chat client. */
function MessageActions({
  content,
  onEdit,
  onRegenerate,
  label,
}: {
  content: string;
  onEdit?: (content: string) => void;
  onRegenerate?: () => void;
  /** Distinguishes the answer's action row from a question's. */
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard may be blocked; the text is still selectable.
    }
  };
  const btn =
    'rounded px-1.5 py-0.5 text-[11px] font-medium text-subtle transition-colors hover:bg-surface-raised hover:text-foreground';
  return (
    <div
      className={cn(
        'flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
        label ? 'mt-3 justify-start border-t border-border pt-2' : 'mt-1 justify-end',
      )}
    >
      {onEdit && (
        <button type="button" className={btn} onClick={() => onEdit(content)}>
          Edit
        </button>
      )}
      <button type="button" className={btn} onClick={() => void copy()}>
        {copied ? 'Copied' : 'Copy'}
      </button>
      {onRegenerate && (
        <button type="button" className={btn} onClick={onRegenerate}>
          Regenerate
        </button>
      )}
    </div>
  );
}

/**
 * A question as the reader wrote it.
 *
 * Exported because the pending state renders one too, and when the two were
 * styled separately they drifted — the pending copy lost `whitespace-pre-wrap`,
 * so a pasted multi-line question showed as one paragraph until the answer
 * arrived and the saved message replaced it.
 */
export function UserBubble({
  content,
  onEdit,
}: {
  content: string;
  onEdit?: (content: string) => void;
}) {
  return (
    <div className="group flex flex-col items-end">
      <div className="flex justify-end">
      {/* whitespace-pre-wrap: a multi-line question the user typed should keep
          the shape they gave it rather than collapsing into one run-on line. */}
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm leading-relaxed text-foreground">
          {content}
        </div>
      </div>
      <MessageActions content={content} {...(onEdit ? { onEdit } : {})} />
    </div>
  );
}

function AssistantCard({
  message,
  onRegenerate,
}: {
  message: Message;
  onRegenerate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // Files the model went and fetched mid-answer, highlighted so the difference
  // from up-front retrieval is visible.
  const opened = new Set(message.openedPaths ?? []);
  const total = message.contextPaths.length;
  const shown = expanded ? message.contextPaths : message.contextPaths.slice(0, CONTEXT_PREVIEW);
  const hidden = total - shown.length;

  return (
    <Card className="group p-5">
      <Markdown content={message.content} />
      <MessageActions
        content={message.content}
        label="answer"
        {...(onRegenerate ? { onRegenerate } : {})}
      />
      {total > 0 && (
        <div className="mt-4 border-t border-border pt-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-subtle">
            Read {total} file{total === 1 ? '' : 's'}
            {opened.size > 0 && (
              <span className="normal-case tracking-normal text-primary">
                {' '}
                · {opened.size} opened while answering
              </span>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {shown.map((path) => (
              <Badge
                key={path}
                className={cn('font-mono', opened.has(path) && 'border-primary/40 text-primary')}
                title={
                  opened.has(path)
                    ? 'Decodr opened this file while answering'
                    : 'Selected before answering'
                }
              >
                {path}
              </Badge>
            ))}
            {total > CONTEXT_PREVIEW && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
              >
                {expanded ? 'Show less' : `+${hidden} more`}
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
