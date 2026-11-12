import { redirect } from 'next/navigation';

import { DemoResetButton } from '@/components/shell/DemoResetButton';
import { LoginForm } from '@/components/shell/LoginForm';
import { SessionSync } from '@/components/shell/SessionSync';
import { LOGIN_REASON, type LoginReason } from '@/domain/paths';
import { ROLE_POLICIES } from '@/domain/roles';
import { getCurrentUser } from '@/server/auth/current-user';
import { isDemoResetEnabled, listDemoAccounts } from '@/server/demo/demo-service';

const REASON_MESSAGES: Readonly<Record<LoginReason, string>> = {
  [LOGIN_REASON.SESSION_ENDED]:
    'Your session has ended — you were signed out or your account was deactivated. Please sign in again.',
  [LOGIN_REASON.LOGGED_OUT]: 'You have been signed out.',
  [LOGIN_REASON.DEMO_RESET]: 'Demo data was reset to the original seed. Everyone has been signed out.',
};

/** Only known reasons get a message; anything else in the URL is ignored. */
function reasonMessage(reason: string | string[] | undefined): string | null {
  const known = Object.values(LOGIN_REASON).find((value) => value === reason);
  return known ? REASON_MESSAGES[known] : null;
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const user = await getCurrentUser();
  if (user) {
    // Already signed in: go home instead of showing the form again.
    redirect(ROLE_POLICIES[user.role].homePath);
  }
  const notice = reasonMessage((await searchParams).reason);

  return (
    <main>
      <SessionSync userId={null} />
      <h1>Sign in</h1>
      {notice && <p className="notice">{notice}</p>}
      <LoginForm accounts={listDemoAccounts()} />
      {isDemoResetEnabled() && (
        <p className="row">
          <span className="muted">Someone broke the demo data?</span>
          <DemoResetButton />
        </p>
      )}
    </main>
  );
}
