type LogLevel = 'info' | 'warn' | 'error';

const secretKey = /password|secret|token|cookie|authorization/i;

function sanitize(value: unknown, key = ''): unknown {
  if (secretKey.test(key)) return '[REDACTED]';
  if (value instanceof Error) return { name: value.name, message: value.message, stack: process.env.NODE_ENV === 'production' ? undefined : value.stack };
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, sanitize(childValue, childKey)]));
  return value;
}

export function log(level: LogLevel, event: string, fields: Record<string, unknown> = {}) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...sanitize(fields) as object });
  if (level === 'error') console.error(entry); else if (level === 'warn') console.warn(entry); else console.log(entry);
}
