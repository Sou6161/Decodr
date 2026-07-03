import { isProd } from '../config/env.js';

type Level = 'debug' | 'info' | 'warn' | 'error';

const COLORS: Record<Level, string> = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
};
const RESET = '\x1b[0m';

function emit(level: Level, message: string, meta?: unknown): void {
  const timestamp = new Date().toISOString();
  if (isProd) {
    // Structured JSON in production for log aggregators.
    console[level === 'debug' ? 'log' : level](
      JSON.stringify({ timestamp, level, message, meta }),
    );
    return;
  }
  const color = COLORS[level];
  const line = `${color}${timestamp} ${level.toUpperCase()}${RESET} ${message}`;
  if (meta !== undefined) console[level === 'debug' ? 'log' : level](line, meta);
  else console[level === 'debug' ? 'log' : level](line);
}

/** Minimal leveled logger. Swap for pino/winston later without touching call sites. */
export const logger = {
  debug: (m: string, meta?: unknown) => emit('debug', m, meta),
  info: (m: string, meta?: unknown) => emit('info', m, meta),
  warn: (m: string, meta?: unknown) => emit('warn', m, meta),
  error: (m: string, meta?: unknown) => emit('error', m, meta),
};
