import { z } from 'zod';

import { ERROR_CODE, type ApiErrorBody } from './errors';
import { ROLE } from './roles';
import { CLIENT_STATUS, USER_STATUS, type Client, type Page, type User } from './types';

/**
 * What the browser accepts back from the API. `apiFetch` (src/lib/api-client.ts) parses every
 * response with one of these, so a response of the wrong shape is an error, never a wrongly typed
 * value. `satisfies` ties each schema to its domain type: change the type and this file stops compiling.
 *
 * Objects are not `.strict()` here (unlike request schemas): the client keeps only the keys it knows.
 */

export const userResponse = z.object({
  id: z.string(),
  fullName: z.string(),
  email: z.string(),
  role: z.enum(ROLE),
  status: z.enum(USER_STATUS),
  managerId: z.string().nullable(),
  createdAt: z.string(),
}) satisfies z.ZodType<User>;

const clientResponse = z.object({
  id: z.string(),
  name: z.string(),
  company: z.string(),
  email: z.string(),
  country: z.string(),
  status: z.enum(CLIENT_STATUS),
  createdAt: z.string(),
}) satisfies z.ZodType<Client>;

export const clientsPageResponse = z.object({
  items: z.array(clientResponse),
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  totalPages: z.number().int(),
}) satisfies z.ZodType<Page<Client>>;

export const loginResponse = z.object({ user: userResponse, homePath: z.string() });

export const okResponse = z.object({ ok: z.literal(true) });

export const apiErrorResponse = z.object({
  error: z.object({
    code: z.enum(ERROR_CODE),
    message: z.string(),
    details: z.unknown().optional(),
  }),
}) satisfies z.ZodType<ApiErrorBody>;
