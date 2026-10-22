import { Link, useParams } from 'react-router-dom';
import { MessageRole } from '@decodr/types';
import { Card, Skeleton } from '@/components/ui';
import { Logo } from '@/components/icons';
import { Markdown } from '@/features/explain/Markdown';
import { UserBubble } from '@/features/explain/ChatMessages';
import { useSharedConversation } from '@/features/explain/hooks';

/**
 * A shared chat, read-only, for whoever holds the link.
 *
 * Deliberately outside the app shell: there is no session here and no project
 * behind the page. The transcript and the project's name are all the endpoint
 * returns, so there is nothing to navigate to — a visitor is a reader, not a
 * guest with limited access.
 *
 * Cited files are plain text on this page rather than buttons. Opening one
 * would mean serving source to anyone with the link, and sharing a
 * conversation is not sharing the codebase.
 */
export function SharedConversationPage() {
  const { token = '' } = useParams();
  const { data, isLoading, error } = useSharedConversation(token);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-80">
            <Logo />
            <span className="text-base font-semibold tracking-tight">Decodr</span>
          </Link>
          <Link
            to="/upload"
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-border-strong hover:text-foreground"
          >
            Analyse your own project
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {isLoading && (
          <div className="space-y-6">
            <Skeleton className="h-8 w-2/5" />
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-48 rounded-2xl" />
          </div>
        )}

        {error && (
          <Card className="p-6">
            <h1 className="text-sm font-semibold text-foreground">This link is not available</h1>
            <p className="mt-1.5 text-sm text-muted">
              It may have been revoked by its owner, or it was never valid. Ask them for a new one.
            </p>
          </Card>
        )}

        {data && (
          <>
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {data.title}
              </h1>
              <p className="mt-1 text-xs text-subtle">
                A shared conversation about {data.repositoryName} · read-only
              </p>
            </div>

            <div className="space-y-6">
              {data.messages.map((message) =>
                message.role === MessageRole.User ? (
                  <UserBubble key={message.id} content={message.content} />
                ) : (
                  <Card key={message.id} className="p-5">
                    <Markdown content={message.content} />
                    {message.contextPaths.length > 0 && (
                      <p className="mt-4 border-t border-border pt-3 text-[11px] text-subtle">
                        Read {message.contextPaths.length} file
                        {message.contextPaths.length === 1 ? '' : 's'}:{' '}
                        <span className="font-mono">{message.contextPaths.join(', ')}</span>
                      </p>
                    )}
                  </Card>
                ),
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
