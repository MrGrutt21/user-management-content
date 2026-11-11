import { ROLE_POLICIES } from '@/domain/roles';
import { loginSchema } from '@/domain/schemas';
import { login } from '@/server/auth/auth-service';
import { SESSION_COOKIE, sessionCookieOptions } from '@/server/auth/session';
import { isHttpsRequest, json, readJson, withPublicApi } from '@/server/http/api';

export const POST = withPublicApi(async ({ req }) => {
  const input = await readJson(req, loginSchema);
  const { user, token, expiresAt } = login(input);
  const response = json({ user, homePath: ROLE_POLICIES[user.role].homePath });
  response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt, isHttpsRequest(req)));
  return response;
});
