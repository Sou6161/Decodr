import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Route-level tests: the real Express app, middleware order and error
 * envelope, over real HTTP. Only the data layer is faked, so no database is
 * needed — what is under test is what the server does with a request.
 */
const repo = {
  findById: vi.fn(),
  list: vi.fn(),
};
vi.mock('../repositories/repositoryRepository.js', () => ({ repositoryRepository: repo }));

const { createApp } = await import('../app.js');

let server: Server;
let base = '';

beforeAll(async () => {
  server = createApp().listen(0);
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
beforeEach(() => {
  repo.findById.mockReset();
  repo.list.mockReset();
});

/** A session cookie the server accepts (64 hex chars). */
const SESSION = 'a'.repeat(64);
const asVisitor = (token = SESSION) => ({ headers: { cookie: `decodr_sid=${token}` } });

const row = (ownerToken: string) => ({
  id: 'r1',
  name: 'demo',
  status: 'READY',
  error: null,
  ownerToken,
  storagePath: '/x',
  fileCount: 1,
  componentCount: 1,
  hookCount: 0,
  routeCount: 0,
  totalLines: 10,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('API over HTTP', () => {
  it('mints an httpOnly session cookie on the first request', async () => {
    const res = await fetch(`${base}/api/ping`);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^decodr_sid=[a-f0-9]{64};/);
    expect(cookie).toMatch(/HttpOnly/i);
  });

  it('keeps an existing valid session instead of minting a new one', async () => {
    const res = await fetch(`${base}/api/ping`, asVisitor());
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('answers unknown routes with the standard error envelope', async () => {
    const res = await fetch(`${base}/api/nope`, asVisitor());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: 'ROUTE_NOT_FOUND', message: 'Route not found: GET /api/nope' },
    });
  });

  it("returns 404, not 403, for another visitor's project, so ids cannot be probed", async () => {
    repo.findById.mockResolvedValue(row('b'.repeat(64)));
    const res = await fetch(`${base}/api/repositories/r1`, asVisitor());
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('REPOSITORY_NOT_FOUND');
  });

  it('serves a project to the visitor who owns it, without leaking owner or storage', async () => {
    repo.findById.mockResolvedValue(row(SESSION));
    const res = await fetch(`${base}/api/repositories/r1`, asVisitor());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.repository.name).toBe('demo');
    expect(body.repository).not.toHaveProperty('ownerToken');
    expect(body.repository).not.toHaveProperty('storagePath');
  });

  it('rejects an invalid question with a 422 that names the reason', async () => {
    repo.findById.mockResolvedValue(row(SESSION));
    const res = await fetch(`${base}/api/repositories/r1/conversations/ask`, {
      method: 'POST',
      headers: { ...asVisitor().headers, 'content-type': 'application/json' },
      body: JSON.stringify({ question: 'hi' }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Question is too short');
  });

  it('rate-limits one session without affecting another', async () => {
    const noisy = 'c'.repeat(64);
    let last = 0;
    for (let i = 0; i < 121; i += 1) {
      last = (await fetch(`${base}/api/ping`, asVisitor(noisy))).status;
    }
    expect(last).toBe(429);
    expect((await fetch(`${base}/api/ping`, asVisitor('d'.repeat(64)))).status).toBe(200);
  });
});
