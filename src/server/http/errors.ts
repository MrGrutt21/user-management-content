import 'server-only';

import { ERROR_CODE, type ApiErrorBody, type Decision, type ErrorCode } from '@/domain/errors';

export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  [ERROR_CODE.UNAUTHENTICATED]: 401,
  [ERROR_CODE.INVALID_CREDENTIALS]: 401,
  [ERROR_CODE.ACCOUNT_DEACTIVATED]: 403,
  [ERROR_CODE.ALREADY_SIGNED_IN]: 409,
  [ERROR_CODE.SESSION_CHANGED]: 409,
  [ERROR_CODE.FORBIDDEN]: 403,
  [ERROR_CODE.CANNOT_DEACTIVATE_SELF]: 403,
  [ERROR_CODE.CANNOT_CHANGE_OWN_ROLE]: 403,
  [ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER]: 409,
  [ERROR_CODE.EMAIL_TAKEN]: 409,
  [ERROR_CODE.INVALID_MANAGER]: 400,
  [ERROR_CODE.VALIDATION]: 400,
  [ERROR_CODE.PAYLOAD_TOO_LARGE]: 413,
  [ERROR_CODE.UNSUPPORTED_MEDIA_TYPE]: 415,
  [ERROR_CODE.NOT_FOUND]: 404,
  [ERROR_CODE.INTERNAL]: 500,
};

/** Throw from services; `withApi` turns it into `{ error: { code, message } }` with the right status. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details === undefined ? {} : { details: this.details }),
      },
    };
  }
}

/** Turn a denied Decision into a thrown AppError. */
export function enforce(decision: Decision): void {
  if (!decision.allowed) {
    throw new AppError(decision.code, decision.message);
  }
}
