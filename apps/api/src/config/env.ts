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

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  STORAGE_DIR: z.string().default('./storage'),
  MAX_UPLOAD_MB: z.coerce.number().int().positive().default(50),

  AI_PROVIDER: z
    .nativeEnum(AIProviderName)
    .default(AIProviderName.OpenAI),
  AI_MODEL: z.string().default('gpt-4o-mini'),
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

/** Resolved absolute path to the storage directory. */
export const storageRoot = path.isAbsolute(env.STORAGE_DIR)
  ? env.STORAGE_DIR
  : path.resolve(__dirname, '../../', env.STORAGE_DIR);

export const isProd = env.NODE_ENV === 'production';
