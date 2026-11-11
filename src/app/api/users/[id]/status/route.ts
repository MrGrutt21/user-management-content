import { changeStatusSchema } from '@/domain/schemas';
import { json, parseOrThrow, withApi } from '@/server/http/api';
import { changeStatus } from '@/server/users/user-service';

export const PATCH = withApi<{ id: string }>({ capability: 'users.changeStatus' }, ({ user, params, body }) => {
  const { status } = parseOrThrow(changeStatusSchema, body);
  return json(changeStatus(user, params.id, status));
});
