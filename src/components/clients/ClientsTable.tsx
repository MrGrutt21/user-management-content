'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  MAX_SEARCH_LENGTH,
  PAGE_SIZES,
  clientsQuerySchema,
  toClientsSearchParams,
  type ClientSortField,
  type ClientsQuery,
} from '@/domain/client-query';
import { PATHS, clientPath } from '@/domain/paths';
import { CLIENT_STATUS, type Client, type Page } from '@/domain/types';
import { clientsPageResponse } from '@/domain/responses';
import { ApiError, apiFetch } from '@/lib/api-client';

import { ClientStatusBadge } from './ClientStatusBadge';
import { ClientsPager } from './ClientsPager';
import { CLIENT_STATUS_LABEL, formatClientDate } from './client-format';

const SEARCH_DEBOUNCE_MS = 300;
const CLIENT_STATUSES = Object.values(CLIENT_STATUS);

const COLUMNS = [
  { field: 'name', label: 'Name' },
  { field: 'company', label: 'Company' },
  { field: 'country', label: 'Country' },
  { field: 'status', label: 'Status' },
  { field: 'createdAt', label: 'Created' },
] as const satisfies readonly { field: ClientSortField; label: string }[];

/** The last answer from the API and which query string it was for. */
type Loaded = { key: string; page: Page<Client> | null; error: string | null };

/**
 * The /content list. The URL is the only state: every control rewrites it,
 * and every URL change fetches one page from the server.
 */
export function ClientsTable() {
  const search = useSearchParams().toString();
  // The browser validates its URL with the same schema the API uses.
  const parsed = useMemo(
    () => clientsQuerySchema.safeParse(Object.fromEntries(new URLSearchParams(search))),
    [search],
  );

  if (!parsed.success) {
    return (
      <p className="notice">
        This link has invalid list settings. <Link href={PATHS.content}>Show all clients</Link>
      </p>
    );
  }
  return <ClientsView query={parsed.data} />;
}

function ClientsView({ query }: { query: ClientsQuery }) {
  const router = useRouter();
  const apiParams = toClientsSearchParams(query).toString();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    // Set when the URL changes again before this answer arrives, so a slow old response cannot overwrite a newer one.
    let stale = false;
    apiFetch(apiParams ? `/api/clients?${apiParams}` : '/api/clients', clientsPageResponse).then(
      (page) => {
        if (!stale) setLoaded({ key: apiParams, page, error: null });
      },
      (error: unknown) => {
        if (stale) return;
        const message = error instanceof ApiError ? error.message : 'Could not load clients';
        setLoaded((previous) => ({ key: apiParams, page: previous?.page ?? null, error: message }));
      },
    );
    return () => {
      stale = true;
    };
  }, [apiParams]);

  const navigate = useCallback(
    (changes: Partial<ClientsQuery>) => {
      // Any change other than an explicit page goes back to page 1.
      const params = toClientsSearchParams({ ...query, page: 1, ...changes }).toString();
      router.replace(params ? `${PATHS.content}?${params}` : PATHS.content, { scroll: false });
    },
    [query, router],
  );

  // Search box: typed text lives in state and reaches the URL after a pause.
  const urlQ = query.q ?? '';
  const [draft, setDraft] = useState(urlQ);
  const [syncedQ, setSyncedQ] = useState(urlQ);
  if (syncedQ !== urlQ) {
    // The URL changed (Back button, or our own debounce). Show it, unless it is only the trimmed draft.
    setSyncedQ(urlQ);
    if (draft.trim() !== urlQ) setDraft(urlQ);
  }
  useEffect(() => {
    const q = draft.trim();
    if (q === urlQ) return;
    const timer = setTimeout(() => navigate({ q: q || undefined }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [draft, urlQ, navigate]);

  function sortBy(field: ClientSortField) {
    const order = field === query.sort && query.order === 'asc' ? 'desc' : 'asc';
    navigate({ sort: field, order });
  }

  const isLoading = loaded?.key !== apiParams;
  const error = isLoading ? null : (loaded?.error ?? null);
  const data = loaded?.page ?? null;
  // A hand-typed `?limit=7` is valid for the API; show it as an option so the select is not lying.
  const pageSizes: readonly number[] = PAGE_SIZES.some((size) => size === query.limit)
    ? PAGE_SIZES
    : [query.limit, ...PAGE_SIZES];

  return (
    <>
      <div className="row">
        <input
          type="search"
          aria-label="Search clients"
          placeholder="Search name, company, email, country"
          maxLength={MAX_SEARCH_LENGTH}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <label className="row">
          Status
          <select
            value={query.status ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              navigate({ status: CLIENT_STATUSES.find((status) => status === value) });
            }}
          >
            <option value="">All</option>
            {CLIENT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {CLIENT_STATUS_LABEL[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="row">
          Per page
          <select value={query.limit} onChange={(event) => navigate({ limit: Number(event.target.value) })}>
            {pageSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {data === null ? (
        !error && <p className="muted">Loading clients…</p>
      ) : (
        <>
          <div className="table-wrap" aria-busy={isLoading} style={{ opacity: isLoading ? 0.6 : 1 }}>
            <table>
              <thead>
                <tr>
                  {COLUMNS.map(({ field, label }) => {
                    const active = field === query.sort;
                    return (
                      <th
                        key={field}
                        aria-sort={active ? (query.order === 'asc' ? 'ascending' : 'descending') : undefined}
                      >
                        <button type="button" onClick={() => sortBy(field)}>
                          {label}
                          {active && (query.order === 'asc' ? ' ▲' : ' ▼')}
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length} className="muted">
                      {data.total === 0 ? 'No clients match' : 'No clients on this page'}
                    </td>
                  </tr>
                ) : (
                  data.items.map((client) => (
                    <tr key={client.id} className="clickable" onClick={() => router.push(clientPath(client.id))}>
                      <td>
                        {/* A real link for keyboard, middle-click and "open in new tab"; it handles its own click. */}
                        <Link href={clientPath(client.id)} onClick={(event) => event.stopPropagation()}>
                          {client.name}
                        </Link>
                      </td>
                      <td>{client.company}</td>
                      <td>{client.country}</td>
                      <td>
                        <ClientStatusBadge status={client.status} />
                      </td>
                      <td>{formatClientDate(client.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <ClientsPager
            page={query.page}
            totalPages={data.totalPages}
            total={data.total}
            onPageChange={(page) => navigate({ page })}
          />
        </>
      )}
    </>
  );
}
