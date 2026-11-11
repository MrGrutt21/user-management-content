'use client';

import Link from 'next/link';
import { useEffect } from 'react';

import { PATHS } from '@/domain/paths';

/**
 * Unexpected errors only. `redirect()`, `forbidden()` and `notFound()` are not errors:
 * Next rethrows them past this boundary, so they still reach /login, forbidden.tsx and not-found.tsx.
 * `retry` re-fetches the segment from the server and renders it again (Next 16.3+).
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main>
      <h1>Something went wrong</h1>
      <p>An unexpected error happened while loading this page.</p>
      <div className="row">
        <button type="button" onClick={() => retry()}>
          Try again
        </button>
        <Link href={PATHS.home}>Go to your home page</Link>
      </div>
    </main>
  );
}
