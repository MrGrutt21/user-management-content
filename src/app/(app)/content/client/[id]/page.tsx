import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ClientStatusBadge } from '@/components/clients/ClientStatusBadge';
import { formatClientDate } from '@/components/clients/client-format';
import { PATHS } from '@/domain/paths';
import { requirePage } from '@/server/auth/current-user';
import { findClient } from '@/server/clients/client-service';

export default async function ClientPage({ params }: PageProps<'/content/client/[id]'>) {
  await requirePage('content.view');
  const { id } = await params;
  const client = findClient(id);
  if (!client) notFound();

  return (
    <main>
      <p>
        <Link href={PATHS.content}>← Back to clients</Link>
      </p>
      <h1>{client.name}</h1>
      <div className="table-wrap">
        <table>
          <tbody>
            <tr>
              <th scope="row">Company</th>
              <td>{client.company}</td>
            </tr>
            <tr>
              <th scope="row">Email</th>
              <td>{client.email}</td>
            </tr>
            <tr>
              <th scope="row">Country</th>
              <td>{client.country}</td>
            </tr>
            <tr>
              <th scope="row">Status</th>
              <td>
                <ClientStatusBadge status={client.status} />
              </td>
            </tr>
            <tr>
              <th scope="row">Created</th>
              <td>
                <time dateTime={client.createdAt}>{formatClientDate(client.createdAt)}</time>
              </td>
            </tr>
            <tr>
              <th scope="row">ID</th>
              <td className="muted">{client.id}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </main>
  );
}
