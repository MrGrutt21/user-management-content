import { json, withPublicApi } from '@/server/http/api';

/** For the Docker HEALTHCHECK and uptime probes. Says nothing about users or sessions. */
export const GET = withPublicApi(() => json({ ok: true }));
