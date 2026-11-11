import 'server-only';

import type { ClientSortField, ClientsQuery, SortOrder } from '@/domain/client-query';
import { ERROR_CODE } from '@/domain/errors';
import type { Client, Page } from '@/domain/types';
import { getStore } from '@/server/db/store';
import { AppError } from '@/server/http/errors';

const SEARCH_FIELDS = ['name', 'company', 'email', 'country'] as const satisfies readonly (keyof Client)[];

// Case-insensitive and accent-aware ("muller" sorts next to "Müller").
const collator = new Intl.Collator('en', { sensitivity: 'base' });

/** Filter, sort and cut out ONE page. The browser never gets more than `limit` (≤ 100) clients. */
export function listClients(query: ClientsQuery): Page<Client> {
  const { page, limit } = query;
  // `filter` returns a new array, so sorting it in place never reorders the store.
  const matching = getStore().clients.filter((client) => matches(client, query));
  matching.sort(compareBy(query.sort, query.order));

  const start = (page - 1) * limit;
  return {
    items: matching.slice(start, start + limit),
    page,
    limit,
    total: matching.length,
    totalPages: Math.max(1, Math.ceil(matching.length / limit)),
  };
}

export function findClient(id: string): Client | undefined {
  return getStore().clientsById.get(id);
}

export function getClient(id: string): Client {
  const client = findClient(id);
  if (!client) {
    throw new AppError(ERROR_CODE.NOT_FOUND, 'Client not found');
  }
  return client;
}

function matches(client: Client, { status, q }: ClientsQuery): boolean {
  if (status && client.status !== status) return false;
  if (!q) return true;
  const needle = q.toLowerCase();
  return SEARCH_FIELDS.some((field) => client[field].toLowerCase().includes(needle));
}

/** Ties are broken by id, so the order (and therefore every page) is deterministic; `desc` is exactly `asc` reversed. */
function compareBy(field: ClientSortField, order: SortOrder): (a: Client, b: Client) => number {
  const direction = order === 'asc' ? 1 : -1;
  return (a, b) => direction * (collator.compare(a[field], b[field]) || collator.compare(a.id, b.id));
}
