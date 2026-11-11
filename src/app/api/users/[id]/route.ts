import { updateProfileSchema } from '@/domain/schemas';
import { json, parseOrThrow, withApi } from '@/server/http/api';
import { getVisibleUser, updateProfile } from '@/server/users/user-service';

export const GET = withApi<{ id: string }>({ capability: 'users.view' }, ({ user, params }) =>
  json(getVisibleUser(user, params.id)),
);

/** Name and email only. The schema is strict, so a `role` or `status` key here is a 400. */
export const PATCH = withApi<{ id: string }>({ capability: 'users.editProfile' }, ({ user, params, body }) =>
  json(updateProfile(user, params.id, parseOrThrow(updateProfileSchema, body))),
);
