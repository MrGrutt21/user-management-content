import type { Metadata } from 'next';

import { CreateUserForm } from '@/components/users/CreateUserForm';
import { UsersTable } from '@/components/users/UsersTable';
import { ROLES, ROLE_POLICIES } from '@/domain/roles';
import { requirePage } from '@/server/auth/current-user';
import { hasCapability } from '@/server/auth/permissions';
import { listAssignableManagers, listVisibleUsers } from '@/server/users/user-service';

export const metadata: Metadata = { title: 'Manage users' };

export default async function ManageUsersPage() {
  // First and outside any try/catch: it redirects or answers 403 by throwing.
  const actor = await requirePage('users.view');

  const rows = listVisibleUsers(actor);
  const canCreate = hasCapability(actor, 'users.create');
  const roleOptions = ROLES.map((role) => ({ value: role, label: ROLE_POLICIES[role].label }));
  // The heading follows the scope of the view permission, not the role name.
  const heading = ROLE_POLICIES[actor.role].can['users.view'] === 'all' ? 'All users' : 'Your direct reports';

  return (
    <main>
      <h1>{heading}</h1>
      <UsersTable rows={rows} roleOptions={roleOptions} />
      {canCreate && <CreateUserForm roleOptions={roleOptions} managerOptions={listAssignableManagers()} />}
    </main>
  );
}
