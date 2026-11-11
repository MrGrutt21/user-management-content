import { clientsQuerySchema } from '@/domain/client-query';
import { listClients } from '@/server/clients/client-service';
import { json, parseOrThrow, withApi } from '@/server/http/api';

/** `GET /api/clients?page&limit&sort&order&status&q` → one `Page<Client>`, never the whole list. */
export const GET = withApi({ capability: 'content.view' }, ({ req }) => {
  const query = parseOrThrow(clientsQuerySchema, Object.fromEntries(req.nextUrl.searchParams));
  return json(listClients(query));
});
