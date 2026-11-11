import type { Metadata } from 'next';

import { requirePage } from '@/server/auth/current-user';
import { getMe } from '@/server/users/user-service';

export const metadata: Metadata = { title: 'My profile' };

export default async function MyProfilePage() {
  const actor = await requirePage('content.view');
  const { user, managerName, roleLabel } = getMe(actor);

  return (
    <main>
      <h1>My profile</h1>
      <dl>
        <dt>Name</dt>
        <dd>{user.fullName}</dd>
        <dt>Email</dt>
        <dd>{user.email}</dd>
        <dt>Role</dt>
        <dd>{roleLabel}</dd>
        <dt>Status</dt>
        <dd>{user.status}</dd>
        <dt>Manager</dt>
        <dd>{managerName ?? '—'}</dd>
        <dt>Created</dt>
        <dd>{user.createdAt.slice(0, 10)}</dd>
      </dl>
    </main>
  );
}
