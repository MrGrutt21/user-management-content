import Link from 'next/link';

import { PATHS } from '@/domain/paths';

/**
 * Rendered with HTTP 403 when a page calls `forbidden()` (see requirePage): the visitor
 * is signed in, but their role lacks the capability. Needs `experimental.authInterrupts`.
 */
export default function Forbidden() {
  return (
    <main>
      <h1>403 — Forbidden</h1>
      <p>You are signed in, but your role does not have access to this page.</p>
      <p>
        {/* `/` redirects to the home page of the current role. */}
        <Link href={PATHS.home}>Go to your home page</Link>
      </p>
    </main>
  );
}
