import Link from 'next/link';

import { DemoResetButton } from '@/components/shell/DemoResetButton';
import { LogoutButton } from '@/components/shell/LogoutButton';
import { SessionSync } from '@/components/shell/SessionSync';
import { PATHS, type AppPath } from '@/domain/paths';
import { ROLE_POLICIES, type Action } from '@/domain/roles';
import { getCurrentUser } from '@/server/auth/current-user';
import { hasCapability } from '@/server/auth/permissions';
import { isDemoResetEnabled } from '@/server/demo/demo-service';

/** A link shows only to roles with its capability, so a new role or page needs no change here. */
const NAV: readonly { href: AppPath; label: string; action: Action }[] = [
  { href: PATHS.content, label: 'Clients', action: 'content.view' },
  { href: PATHS.me, label: 'My profile', action: 'content.view' },
  { href: PATHS.manageUsers, label: 'Manage users', action: 'users.view' },
];

/**
 * Server component in the (app) layout. It uses getCurrentUser(), not requireUser():
 * the page's own guard decides where to redirect. Hiding links is UX only: each page checks again.
 */
export async function TopBar() {
  const user = await getCurrentUser();

  return (
    <header className="topbar">
      <SessionSync userId={user?.id ?? null} />
      <Link href={PATHS.home}>
        <strong>User Management &amp; Content</strong>
      </Link>
      {user && (
        <nav>
          {NAV.filter((item) => hasCapability(user, item.action)).map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
      )}
      <span className="spacer" />
      {user && (
        <>
          <span>
            {user.fullName} <span className="muted">({ROLE_POLICIES[user.role].label})</span>
          </span>
          <LogoutButton />
        </>
      )}
      {isDemoResetEnabled() && <DemoResetButton />}
    </header>
  );
}
