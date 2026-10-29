/**
 * Counts request handlers that are still running, so shutdown can wait for them.
 *
 * "The response has been sent" is not the same as "the handler is done". An
 * answer stream keeps writing to the database after its last byte goes out, and
 * a stopped answer saves its partial text only after the socket has closed. So
 * this tracks the handler's promise, not the HTTP connection.
 */

let active = 0;
const onIdle = new Set<() => void>();

/** Wraps a handler's work so it is counted until it settles, however it settles. */
export function track<T>(work: Promise<T>): Promise<T> {
  active += 1;
  return work.finally(() => {
    active -= 1;
    if (active === 0) {
      for (const resolve of onIdle) resolve();
      onIdle.clear();
    }
  });
}

/** Handlers currently running. */
export function inFlight(): number {
  return active;
}

/**
 * Resolves `true` once nothing is running, or `false` if the timeout passes
 * first. Never rejects: shutdown has to proceed either way.
 */
export function drained(timeoutMs: number): Promise<boolean> {
  if (active === 0) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      onIdle.delete(done);
      resolve(false);
    }, timeoutMs);
    onIdle.add(done);
  });
}
