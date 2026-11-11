import { changeRoleSchema } from '@/domain/schemas';
import { json, parseOrThrow, withApi } from '@/server/http/api';
import { changeRole } from '@/server/users/user-service';

export const PATCH = withApi<{ id: string }>({ capability: 'users.changeRole' }, ({ user, params, body }) => {
  const { role } = parseOrThrow(changeRoleSchema, body);
  return json(changeRole(user, params.id, role));
});
