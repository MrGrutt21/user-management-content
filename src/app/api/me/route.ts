import { json, withApi } from '@/server/http/api';
import { getMe } from '@/server/users/user-service';

/** Any logged-in user, whatever the role. */
export const GET = withApi({}, ({ user }) => json(getMe(user)));
