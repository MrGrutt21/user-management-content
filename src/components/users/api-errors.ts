import { ApiError } from '@/lib/api-client';

/** A VALIDATION error carries zod issues in `details`: keep the first message per top-level field. */
export function fieldErrors(error: unknown): Record<string, string> {
  const result: Record<string, string> = {};
  if (!(error instanceof ApiError) || !Array.isArray(error.details)) return result;
  const issues: unknown[] = error.details;
  for (const issue of issues) {
    if (typeof issue !== 'object' || issue === null || !('path' in issue) || !('message' in issue)) continue;
    const field: unknown = Array.isArray(issue.path) ? issue.path[0] : undefined;
    if (typeof field === 'string' && typeof issue.message === 'string') result[field] ??= issue.message;
  }
  return result;
}

/** One line for an inline error: the field messages if there are any, else the API's message. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not reach the server. Try again.';
  const messages = Object.values(fieldErrors(error));
  return messages.length > 0 ? messages.join('; ') : error.message;
}
