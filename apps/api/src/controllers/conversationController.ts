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
