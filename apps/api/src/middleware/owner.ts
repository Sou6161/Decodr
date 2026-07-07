import { randomBytes } from 'node:crypto';
import type { RequestHandler } from 'express';
import { isProd } from '../config/env.js';
import { AppError } from '../utils/AppError.js';
import { repositoryRepository } from '../repositories/repositoryRepository.js';

const COOKIE = 'arcloom_sid';
const TOKEN_RE = /^[a-f0-9]{64}$/;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 90; // 90 days

/**
 * Per-visitor isolation. On first request we mint an unguessable 256-bit token
 * and store it in an httpOnly, SameSite=Lax cookie (Secure in production). Every
 * project a visitor uploads is scoped to their token, so one visitor can never
 * see another's code. No login required.
 */
export const attachOwner: RequestHandler = (req, res, next) => {
  const existing = req.cookies?.[COOKIE] as string | undefined;
  let token = existing && TOKEN_RE.test(existing) ? existing : undefined;

  if (!token) {
    token = randomBytes(32).toString('hex');
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: MAX_AGE_MS,
      path: '/',
    });
  }

  req.ownerToken = token;
  next();
};

/**
 * Guards a `/:id` route: the requested repository must exist AND belong to the
 * caller's session, otherwise it's a 404 (indistinguishable from "doesn't
 * exist", so ids can't be probed across sessions).
 */
export const requireOwnedRepository: RequestHandler = async (req, _res, next) => {
  const id = req.params.id;
  if (!id) {
    next(AppError.badRequest('Missing repository id'));
    return;
  }
  const repo = await repositoryRepository.findById(id);
  if (!repo || repo.ownerToken !== req.ownerToken) {
    next(AppError.notFound('Repository not found', 'REPOSITORY_NOT_FOUND'));
    return;
  }
  next();
};
