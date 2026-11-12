'use client';

import { useState } from 'react';

import { LOGIN_REASON, loginPath } from '@/domain/paths';
import { okResponse } from '@/domain/responses';
import { ApiError, apiFetch } from '@/lib/api-client';
import { announceSessionChange } from '@/lib/session-tab';

/** Shown only when the server has DEMO_RESET=true. The endpoint itself also checks it. */
export function DemoResetButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    if (!window.confirm('Reset all users, clients and sessions to the original demo data?')) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/demo/reset', okResponse, { method: 'POST' });
      announceSessionChange();
      // Everyone is logged out now; a full reload re-renders the server components.
      window.location.assign(loginPath(LOGIN_REASON.DEMO_RESET));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={reset} disabled={busy}>
        Reset demo data
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}
