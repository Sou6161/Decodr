import { useState } from 'react';
import type { Message } from '@decodr/types';
import { MessageRole } from '@decodr/types';
import { Badge, Card } from '@/components/ui';
import { Markdown } from './Markdown';
import { cn } from '@/utils/cn';

const CONTEXT_PREVIEW = 5;

export function ChatMessages({ messages }: { messages: Message[] }) {
  return (
    <div className="space-y-6">
      {messages.map((message) =>
        message.role === MessageRole.User ? (
          <UserBubble key={message.id} content={message.content} />
        ) : (
          <AssistantCard key={message.id} message={message} />
        ),
      )}
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      {/* whitespace-pre-wrap: a multi-line question the user typed should keep
          the shape they gave it rather than collapsing into one run-on line. */}
      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm leading-relaxed text-foreground">
        {content}
      </div>
    </div>
  );
}

function AssistantCard({ message }: { message: Message }) {
  const [expanded, setExpanded] = useState(false);
  // Files the model went and fetched mid-answer, highlighted so the difference
  // from up-front retrieval is visible.
  const opened = new Set(message.openedPaths ?? []);
  const total = message.contextPaths.length;
  const shown = expanded ? message.contextPaths : message.contextPaths.slice(0, CONTEXT_PREVIEW);
  const hidden = total - shown.length;

  return (
    <Card className="p-5">
      <Markdown content={message.content} />
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
