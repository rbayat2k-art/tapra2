import { config as loadDotEnv } from 'dotenv';
import { z } from 'zod';

let loaded = false;
let cached: Environment | undefined;

const booleanValue = z.preprocess((value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url().refine((value) => value.startsWith('postgresql://'), 'DATABASE_URL must use postgresql://'),
  DATABASE_MIGRATION_URL: z.string().url().refine((value) => value.startsWith('postgresql://')).optional(),
  SESSION_COOKIE_SECURE: booleanValue.default(false),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(12),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Environment = z.infer<typeof schema>;

export function loadEnvironmentFiles(): void {
  if (loaded) return;
  loadDotEnv({ path: '.env.local', override: false, quiet: true });
  loadDotEnv({ override: false, quiet: true });
  loaded = true;
}

export function getEnvironment(): Environment {
  if (cached) return cached;
  loadEnvironmentFiles();
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.') || 'environment').join(', ');
    throw new Error(`Invalid server environment configuration: ${fields}`);
  }
  cached = result.data;
  return cached;
}

export function resetEnvironmentForTests(): void {
  cached = undefined;
  loaded = false;
}
