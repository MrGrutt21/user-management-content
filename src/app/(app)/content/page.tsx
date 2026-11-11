import { Suspense } from 'react';

import { ClientsTable } from '@/components/clients/ClientsTable';
import { requirePage } from '@/server/auth/current-user';

export default async function ContentPage() {
  // Outside any Suspense boundary: a missing session must redirect and a missing capability must answer 403.
  await requirePage('content.view');

  return (
    <main>
      <h1>Clients</h1>
      {/* ClientsTable reads the URL with useSearchParams. */}
      <Suspense fallback={<p className="muted">Loading clients…</p>}>
        <ClientsTable />
      </Suspense>
    </main>
  );
}
