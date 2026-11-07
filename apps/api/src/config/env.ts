import { config as loadDotenv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AIProviderName } from '@decodr/types';

// Load the repo-root .env (two levels up from apps/api) so a single file
// configures the whole monorepo.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(__dirname, '../../../../.env');
loadDotenv({ path: rootEnvPath });

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  // Hosting platforms (Render, etc.) inject PORT; prefer it when present.
  PORT: z.coerce.number().int().positive().optional(),
  WEB_ORIGIN: z.string().default('http://localhost:5173'),
  /**
   * Optional cookie domain, e.g. ".imsrb.in", for when the API is served from
   * the web app's own site (api.imsrb.in). The session cookie then becomes
   * first-party (SameSite=Lax), which browsers that block third-party cookies
   * still accept. Leave unset while the API lives on a different site.
   */
  COOKIE_DOMAIN: z.string().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(50),

  AI_PROVIDER: z
    .nativeEnum(AIProviderName)
    .default(AIProviderName.OpenAI),
  AI_MODEL: z.string().default('gpt-4o-mini'),
  /**
   * Models to try, in order, when the primary one fails for a reason another
   * model could survive — overload, rate limits, exhausted credits. Free pools
   * are shared and rate-limit without warning, so one model is a single point
   * of failure.
   */
  AI_FALLBACK_MODELS: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  /** Optional override for OpenAI-compatible gateways (e.g. OpenRouter). */
  OPENAI_BASE_URL: z.string().optional().default(''),
  /** Attribution title sent to gateways like OpenRouter (X-Title header). */
  AI_SITE_NAME: z.string().default('Decodr'),
  /**
   * Enable reasoning on OpenRouter (`reasoning: { enabled: true }`). Useful with
   * the `openrouter/free` router, which routes to reasoning-capable models.
   */
  AI_REASONING: z
    .string()
    .default('false')
    .transform((v) => v.toLowerCase() === 'true'),
});

type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Validated, strongly-typed environment. Import this — never read process.env directly. */
export const env = loadEnv();

/** The port to bind to — the platform's PORT wins over API_PORT. */
export const port = env.PORT ?? env.API_PORT;

/** Resolved absolute path to the storage directory. */
export const storageRoot = path.isAbsolute(env.STORAGE_DIR)
  ? env.STORAGE_DIR
  : path.resolve(__dirname, '../../', env.STORAGE_DIR);

export const isProd = env.NODE_ENV === 'production';

/**
 * The model of last resort on OpenRouter: its own router over whichever free
 * models are live at that moment.
 *
 * Specific free model ids get withdrawn without notice — the configured fallback
 * `poolside/laguna-s-2.1:free` disappeared, which left the chain one model long
 * without anyone noticing. This id is OpenRouter's, not a model's, so it cannot
 * be withdrawn the same way. Quality varies by whatever it routes to, which is
 * why it goes LAST rather than being the default.
 */
export const LAST_RESORT_MODEL = 'openrouter/free';

/**
 * The primary model, its configured fallbacks, then the last resort.
 *
 * Fallback used to exist only if AI_FALLBACK_MODELS was set. Left unset, the
 * chain was a single paid model, and when its credits ran out every question
 * failed — the exact single point of failure the chain exists to remove. The
 * safety net is now part of the chain whatever the configuration says.
 */
export function buildModelChain(primary: string, fallbacksCsv: string, baseURL: string): string[] {
  return [
    primary,
    ...fallbacksCsv.split(',').map((m) => m.trim()).filter(Boolean),
    ...(/openrouter\.ai/i.test(baseURL) ? [LAST_RESORT_MODEL] : []),
  ].filter((m, i, all) => m && all.indexOf(m) === i);
}

export const modelChain: string[] = buildModelChain(
  env.AI_MODEL,
  env.AI_FALLBACK_MODELS,
  env.OPENAI_BASE_URL,
);

/**
 * Every origin allowed by CORS. WEB_ORIGIN may list several, comma-separated,
 * so the app can be served from more than one domain.
 */
export const allowedOrigins = env.WEB_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean);

/**
 * The canonical public origin. Use this wherever a *single* value is required —
 * notably outbound HTTP headers, where a comma-separated list is not a legal
 * header value and makes the request fail before it is sent.
 */
export const primaryOrigin = allowedOrigins[0] ?? 'http://localhost:5173';
