import { createUserSchema } from '@/domain/schemas';
import { json, parseOrThrow, withApi } from '@/server/http/api';
import { createUser, listVisibleUsers } from '@/server/users/user-service';

export const GET = withApi({ capability: 'users.view' }, ({ user }) => json(listVisibleUsers(user)));

export const POST = withApi({ capability: 'users.create' }, ({ user, body }) =>
  json(createUser(user, parseOrThrow(createUserSchema, body)), { status: 201 }),
);
