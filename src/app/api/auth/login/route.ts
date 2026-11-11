import { ROLE_POLICIES } from '@/domain/roles';
import { loginSchema } from '@/domain/schemas';
import { login } from '@/server/auth/auth-service';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/session';
import { isHttpsRequest, json, parseOrThrow, withPublicApi } from '@/server/http/api';

export const POST = withPublicApi(({ req, body }) => {
  const { user, token, expiresAt } = login(parseOrThrow(loginSchema, body), req.cookies.get(SESSION_COOKIE)?.value);
  const response = json({ user, homePath: ROLE_POLICIES[user.role].homePath });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, isHttpsRequest(req)));
  return response;
});
