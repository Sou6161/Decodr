import type { Request, Response } from 'express';
import { z } from 'zod';
import type {
  AskResponse,
  ConversationResponse,
  ListConversationsResponse,
} from '@decodr/types';
import { conversationService } from '../services/conversationService.js';
import { AppError } from '../utils/AppError.js';

const AskBodySchema = z.object({
  conversationId: z.string().min(1).optional(),
  question: z.string().min(3, 'Question is too short').max(500, 'Question is too long'),
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

    // If the reader navigates away, stop paying for tokens nobody will see.
    let aborted = false;
    req.on('close', () => {
      aborted = true;
    });

    try {
      const result = await conversationService.ask({
        repositoryId: requireParam(req, 'id'),
        ...(conversationId ? { conversationId } : {}),
        question,
        ...(detailed !== undefined ? { detailed } : {}),
        stream: {
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
      const message =
        err instanceof AppError ? err.message : 'Something went wrong generating the explanation.';
      if (!aborted) send('error', { message });
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
