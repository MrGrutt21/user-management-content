'use client';

import { useState } from 'react';

import { LOGIN_REASON, loginPath } from '@/domain/paths';
import { okResponse } from '@/domain/responses';
import { ApiError, apiFetch } from '@/lib/api-client';
import { announceSessionChange } from '@/lib/session-tab';

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/auth/logout', okResponse, { method: 'POST' });
      announceSessionChange();
      // Full reload, so the server components (the top bar too) render as logged out.
      window.location.assign(loginPath(LOGIN_REASON.LOGGED_OUT));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" onClick={logout} disabled={busy}>
        Log out
      </button>
      {error && <span className="error">{error}</span>}
    </>
  );
}
