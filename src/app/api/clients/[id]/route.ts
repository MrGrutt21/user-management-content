import { getClient } from '@/server/clients/client-service';
import { json, withApi } from '@/server/http/api';

/** `GET /api/clients/:id` → one client, or 404 `NOT_FOUND`. */
export const GET = withApi<{ id: string }>({ capability: 'content.view' }, ({ params }) => json(getClient(params.id)));
