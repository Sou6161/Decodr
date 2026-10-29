import rateLimit, { ipKeyGenerator, type RateLimitRequestHandler } from 'express-rate-limit';
import { AppError } from '../utils/AppError.js';

/**
 * Rate limits, in two layers. There is no login, so these are the only thing
 * standing between a public demo and an unbounded bill.
 *
 * 1. Per session (the owner token). This is the limit a real visitor meets.
 *    Keying on the token rather than IP is deliberate: several visitors can
 *    share an IP (offices, mobile carriers, corporate VPNs), and IP-based
 *    limits would punish them for each other's usage.
 *
 * 2. Per IP, set several times higher. The session limit alone had a hole: a
 *    script that never sends the cookie back is minted a fresh token — and so
 *    a fresh, empty bucket — on every request. The IP ceiling bounds that,
 *    while staying loose enough that a shared IP is not the bottleneck for the
 *    people behind it.
 */
function keyBySession(req: { ownerToken?: string; ip?: string }): string {
  if (req.ownerToken) return req.ownerToken;
  return keyByIp(req);
}

/**
 * ipKeyGenerator normalises IPv6 to its /64 prefix — without it a single
 * client could rotate through addresses in its own subnet and bypass the limit.
 */
function keyByIp(req: { ip?: string }): string {
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
}

const handler = (message: string) => () => {
  throw new AppError(429, 'RATE_LIMITED', message);
};

function limiter(
  windowMs: number,
  limit: number,
  keyGenerator: (req: { ownerToken?: string; ip?: string }) => string,
  message: string,
): RateLimitRequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator,
    handler: handler(message),
  });
}

const HOUR = 60 * 60_000;
/** How many sessions' worth of traffic one IP may carry. */
const IP_MULTIPLIER = 5;

/** Broad ceiling on all API traffic. */
export const generalLimiter: RateLimitRequestHandler[] = [
  limiter(60_000, 120, keyBySession, 'Too many requests. Please wait a moment and try again.'),
  limiter(60_000, 120 * IP_MULTIPLIER, keyByIp, 'Too many requests from your network. Please wait a moment.'),
];

/** Uploads are expensive (disk, CPU, database) — much tighter. */
export const uploadLimiter: RateLimitRequestHandler[] = [
  limiter(HOUR, 20, keyBySession, 'Upload limit reached. Please try again later.'),
  limiter(HOUR, 20 * IP_MULTIPLIER, keyByIp, 'Upload limit reached for your network. Please try again later.'),
];

/**
 * AI questions cost real money per call, so this is the limit that actually
 * protects the budget.
 */
export const askLimiter: RateLimitRequestHandler[] = [
  limiter(HOUR, 40, keyBySession, 'You have reached the hourly question limit. Please try again later.'),
  limiter(
    HOUR,
    40 * IP_MULTIPLIER,
    keyByIp,
    'Your network has reached the hourly question limit. Please try again later.',
  ),
];
