import { ERROR_CODE } from '@/domain/errors';
import { SESSION_COOKIE, expiredCookieOptions } from '@/server/auth/session';
import { isDemoResetEnabled, resetDemoData } from '@/server/demo/demo-service';
import { isHttpsRequest, json, withPublicApi } from '@/server/http/api';
import { AppError } from '@/server/http/errors';

/**
 * Public on purpose: a reviewer who deactivated every account must still be able to reset.
 * Without DEMO_RESET=true it answers 404, as if the endpoint did not exist.
 */
export const POST = withPublicApi(({ req }) => {
  if (!isDemoResetEnabled()) {
    throw new AppError(ERROR_CODE.NOT_FOUND, 'Not found');
  }
  resetDemoData();
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', expiredCookieOptions(isHttpsRequest(req)));
  return response;
});
