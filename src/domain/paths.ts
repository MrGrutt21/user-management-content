/** App routes. Use these instead of writing paths inline. */
export const PATHS = {
  home: '/',
  login: '/login',
  content: '/content',
  me: '/content/me',
  manageUsers: '/manage-users',
} as const;

export type AppPath = (typeof PATHS)[keyof typeof PATHS];

export function clientPath(id: string): string {
  return `${PATHS.content}/client/${encodeURIComponent(id)}`;
}

/** Why the user was sent to /login. Shown as a message on the login page. */
export const LOGIN_REASON = {
  SESSION_ENDED: 'session_ended',
  LOGGED_OUT: 'logged_out',
  DEMO_RESET: 'demo_reset',
} as const;

export type LoginReason = (typeof LOGIN_REASON)[keyof typeof LOGIN_REASON];

export function loginPath(reason?: LoginReason): string {
  return reason ? `${PATHS.login}?reason=${reason}` : PATHS.login;
}
