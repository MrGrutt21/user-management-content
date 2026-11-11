import 'server-only';

/** All environment variables are read here and nowhere else. */
export type AppConfig = {
  /**
   * Send the session cookie with `Secure`. `auto` (default) follows the request:
   * Secure over HTTPS (also behind a proxy via X-Forwarded-Proto), not over plain HTTP,
   * where a Secure cookie would be silently dropped and login would never stick.
   */
  cookieSecure: boolean | 'auto';
  /** Enables POST /api/demo/reset (the "reset demo data" button). Off unless DEMO_RESET=true. */
  demoResetEnabled: boolean;
  sessionTtlMs: number;
};

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

/** Read on every call (cheap) so tests can change process.env between cases. */
export function getConfig(): AppConfig {
  return {
    cookieSecure: process.env.COOKIE_SECURE ? readBoolean(process.env.COOKIE_SECURE, false) : 'auto',
    demoResetEnabled: readBoolean(process.env.DEMO_RESET, false),
    sessionTtlMs: 8 * 60 * 60 * 1000,
  };
}
