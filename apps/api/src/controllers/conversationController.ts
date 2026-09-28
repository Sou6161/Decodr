import type { Request, Response } from 'express';
import { z } from 'zod';
import type {
  AskResponse,
  ConversationResponse,
  ListConversationsResponse,
} from '@decodr/types';
import { conversationService } from '../services/conversationService.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

const AskBodySchema = z.object({
  conversationId: z.string().min(1).optional(),
  // 500 was far too tight: a considered architecture question — "walk me through
  // the request path, and tell me where Socket.IO fits" — runs past it easily.
  // This is generous but still bounded; at ~4 chars per token it costs about
  // 1k tokens, negligible against the context budget.
  question: z
    .string()
    .min(3, 'Question is too short')
    .max(4000, 'Question is too long — keep it under 4000 characters'),
  detailed: z.boolean().optional(),
});

function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (!value) throw AppError.badRequest(`Missing ${name}`);
  return value;
}

export const conversationController = {
  async list(req: Request, res: Response): Promise<void> {
    const conversations = await conversationService.list(requireParam(req, 'id'));
    const body: ListConversationsResponse = { conversations };
    res.json(body);
  },

  async detail(req: Request, res: Response): Promise<void> {
    const conversation = await conversationService.get(
      requireParam(req, 'id'),
      requireParam(req, 'cid'),
    );
    const body: ConversationResponse = { conversation };
    res.json(body);
  },

  /**
   * Streams the answer over Server-Sent Events.
   *
   * The same service runs, so the conversation is persisted identically; the
   * only difference is that text reaches the browser as it is generated instead
   * of after the whole answer is ready. A question that needs a file read can
   * take a minute, and a spinner for that long reads as a hang.
   */
  async askStream(req: Request, res: Response): Promise<void> {
    const { conversationId, question, detailed } = AskBodySchema.parse(req.body);

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Proxies that buffer would defeat the point of streaming.
      'X-Accel-Buffering': 'no',
    });

    const send = (event: string, data: unknown): void => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // If the reader stops the answer or navigates away, cancel the upstream
    // call too. Previously this only muted the output — the model kept running
    // and the tokens were still paid for.
    let aborted = false;
    const controller = new AbortController();
    // `res` not `req`: for a streaming response the request stream closes once
    // its body has been read, so req's 'close' says nothing about whether the
    // reader is still there. res emits 'close' when the connection actually
    // ends — which is what "they pressed Stop" looks like from here.
    res.on('close', () => {
      if (aborted || res.writableEnded) return;
      aborted = true;
      controller.abort();
      logger.info('Explain stopped by the reader — upstream request cancelled');
    });

    try {
      const result = await conversationService.ask({
        repositoryId: requireParam(req, 'id'),
        ...(conversationId ? { conversationId } : {}),
        question,
        ...(detailed !== undefined ? { detailed } : {}),
        signal: controller.signal,
        stream: {
          onStart: (intent) => {
            if (!aborted) send('start', { intent });
          },
          onContext: (paths) => {
            if (!aborted) send('context', { paths });
          },
          onDelta: (text) => {
            if (!aborted) send('delta', { text });
          },
          onFiles: (paths) => {
            if (!aborted) send('files', { paths });
          },
          onReset: () => {
            if (!aborted) send('reset', {});
          },
        },
      });
      if (!aborted) send('done', result);
    } catch (err) {
      // A stop is not a failure — the reader asked for it.
      if (aborted) return;
      const message =
        err instanceof AppError ? err.message : 'Something went wrong generating the explanation.';
      send('error', { message });
    } finally {
      res.end();
    }
  },

  async ask(req: Request, res: Response): Promise<void> {
    const { conversationId, question, detailed } = AskBodySchema.parse(req.body);
    const body: AskResponse = await conversationService.ask({
      repositoryId: requireParam(req, 'id'),
      ...(conversationId ? { conversationId } : {}),
      question,
      ...(detailed !== undefined ? { detailed } : {}),
    });
    res.status(201).json(body);
  },

  async remove(req: Request, res: Response): Promise<void> {
    await conversationService.remove(requireParam(req, 'id'), requireParam(req, 'cid'));
    res.status(204).send();
  },
};
