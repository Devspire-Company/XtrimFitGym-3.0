import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DATABASE: z.string().min(1).default('XtrimFitGym3'),
  SESSION_SECRET: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(32),
  ALLOWED_ORIGINS: z.string().min(1),
  ADMIN_APP_ORIGIN: z.string().url(),
  MEMBER_APP_ORIGIN: z.string().url(),
  SESSION_COOKIE_NAME: z.string().min(1).default('xtrim_session'),
  SESSION_HOURS_ADMIN: z.coerce.number().positive().default(8),
  SESSION_HOURS_MEMBER: z.coerce.number().positive().default(168),
  ATTENDANCE_DUPLICATE_SECONDS: z.coerce.number().int().min(30).default(120),
});

export type Config = z.infer<typeof schema> & { allowedOrigins: string[] };
let cached: Config | undefined;

export function config(): Config {
  if (cached) return cached;
  const parsed = schema.parse(process.env);
  cached = { ...parsed, allowedOrigins: parsed.ALLOWED_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean) };
  return cached;
}
