import { redirect } from 'next/navigation';

import { ROLE_POLICIES } from '@/domain/roles';
import { requireUser } from '@/server/auth/current-user';

/**
 * `/` has no content of its own. Logged in -> the role's home (IT: /manage-users,
 * others: /content). Not logged in -> requireUser() redirects to /login.
 */
export default async function HomePage() {
  const user = await requireUser();
  redirect(ROLE_POLICIES[user.role].homePath);
}
