import Link from 'next/link';

import { PATHS } from '@/domain/paths';

/** Unknown URLs and `notFound()` calls. Rendered with HTTP 404. */
export default function NotFound() {
  return (
    <main>
      <h1>404 — Page not found</h1>
      <p>There is no page at this address.</p>
      <p>
        <Link href={PATHS.home}>Go to your home page</Link>
      </p>
    </main>
  );
}
