/**
 * Error codes returned by the API as `{ error: { code, message } }`.
 * The HTTP status for each code lives in `src/server/http/errors.ts`.
 */
export const ERROR_CODE = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  FORBIDDEN: 'FORBIDDEN',
  CANNOT_DEACTIVATE_SELF: 'CANNOT_DEACTIVATE_SELF',
  CANNOT_CHANGE_OWN_ROLE: 'CANNOT_CHANGE_OWN_ROLE',
  LAST_ACTIVE_ROLE_MEMBER: 'LAST_ACTIVE_ROLE_MEMBER',
  EMAIL_TAKEN: 'EMAIL_TAKEN',
  INVALID_MANAGER: 'INVALID_MANAGER',
  VALIDATION: 'VALIDATION',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL: 'INTERNAL',
} as const;

export type ErrorCode = (typeof ERROR_CODE)[keyof typeof ERROR_CODE];

export type ApiErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
};

/**
 * Result of a permission or invariant check. The server uses it both to reject a
 * mutation and to tell the UI, ahead of time, why a control is disabled.
 */
export type Decision =
  | { allowed: true }
  | { allowed: false; code: ErrorCode; message: string };

export const ALLOWED: Decision = { allowed: true };

export function deny(code: ErrorCode, message: string): Decision {
  return { allowed: false, code, message };
}
