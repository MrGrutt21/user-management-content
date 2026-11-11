import { ERROR_CODE } from '@/domain/errors';
import { withPublicApi } from '@/server/http/api';
import { AppError } from '@/server/http/errors';

/**
 * Any /api path that no other route matches answers a JSON 404, like every other API error,
 * instead of the HTML not-found page. Known routes win over this catch-all, so a method they
 * do not export (e.g. DELETE /api/users/:id) still answers 405.
 */
function noSuchEndpoint(): never {
  throw new AppError(ERROR_CODE.NOT_FOUND, 'No such API endpoint');
}

export const GET = withPublicApi<{ path: string[] }>(noSuchEndpoint);
export const POST = withPublicApi<{ path: string[] }>(noSuchEndpoint);
export const PATCH = withPublicApi<{ path: string[] }>(noSuchEndpoint);
export const PUT = withPublicApi<{ path: string[] }>(noSuchEndpoint);
export const DELETE = withPublicApi<{ path: string[] }>(noSuchEndpoint);
