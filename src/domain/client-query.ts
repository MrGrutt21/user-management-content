import { z } from 'zod';

import { CLIENT_STATUS } from './types';

/**
 * The query of `GET /api/clients`, which is also the URL state of /content.
 * One schema for the server and the browser, so the two cannot drift apart.
 */

export const CLIENT_SORT_FIELDS = ['name', 'company', 'country', 'status', 'createdAt'] as const;
export const SORT_ORDERS = ['asc', 'desc'] as const;
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_LIMIT = 25;
export const MAX_LIMIT = 100;
export const MAX_SEARCH_LENGTH = 100;

export type ClientSortField = (typeof CLIENT_SORT_FIELDS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

/** Query values arrive as strings. Anything out of range is a 400: `limit=1000` is rejected, never clamped. */
export const clientsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  sort: z.enum(CLIENT_SORT_FIELDS).default('createdAt'),
  order: z.enum(SORT_ORDERS).default('desc'),
  status: z.enum(CLIENT_STATUS).optional(),
  // `?q=` (an emptied search box) means "no search".
  q: z
    .string()
    .trim()
    .max(MAX_SEARCH_LENGTH)
    .transform((value) => value || undefined)
    .optional(),
});

export type ClientsQuery = z.infer<typeof clientsQuerySchema>;

export const DEFAULT_CLIENTS_QUERY: ClientsQuery = clientsQuerySchema.parse({});

/** Fixed key order keeps URLs readable and stable. */
const PARAM_KEYS = ['q', 'status', 'sort', 'order', 'page', 'limit'] as const satisfies readonly (keyof ClientsQuery)[];

/** Query string for the URL and the API call. Default values are left out, so plain `/content` is the default list. */
export function toClientsSearchParams(query: Partial<ClientsQuery>): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    const value = query[key];
    if (value === undefined || value === '' || value === DEFAULT_CLIENTS_QUERY[key]) continue;
    params.set(key, String(value));
  }
  return params;
}
