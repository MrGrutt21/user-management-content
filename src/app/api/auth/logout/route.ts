import { SESSION_COOKIE, deleteSession, expiredCookieOptions } from '@/server/auth/session';
import { isHttpsRequest, json, withPublicApi } from '@/server/http/api';

/** Public on purpose: logging out with a dead session must still clear the cookie. */
export const POST = withPublicApi(({ req }) => {
  deleteSession(req.cookies.get(SESSION_COOKIE)?.value);
  const response = json({ ok: true });
  response.cookies.set(SESSION_COOKIE, '', expiredCookieOptions(isHttpsRequest(req)));
  return response;
});
