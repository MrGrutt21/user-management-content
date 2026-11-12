'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';

import { ERROR_CODE } from '@/domain/errors';
import { PATHS } from '@/domain/paths';
import { loginResponse } from '@/domain/responses';
import { USER_STATUS, type DemoAccount } from '@/domain/types';
import { ApiError, apiFetch } from '@/lib/api-client';
import { announceSessionChange } from '@/lib/session-tab';

export function LoginForm({ accounts }: { accounts: readonly DemoAccount[] }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // This browser is already signed in (e.g. in another tab): offer that account instead of a second one.
  const [alreadySignedIn, setAlreadySignedIn] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { homePath } = await apiFetch('/api/auth/login', loginResponse, {
        method: 'POST',
        body: { email, password },
      });
      announceSessionChange();
      // Full reload, so the server components (the top bar too) render for the new user.
      window.location.assign(homePath);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server');
      setAlreadySignedIn(err instanceof ApiError && err.code === ERROR_CODE.ALREADY_SIGNED_IN);
      setSubmitting(false);
    }
  }

  function fill(account: DemoAccount) {
    setEmail(account.email);
    setPassword(account.password);
    setError(null);
  }

  return (
    <>
      <form className="stack" onSubmit={onSubmit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error && <p className="error">{error}</p>}
        {alreadySignedIn && <Link href={PATHS.home}>Continue as the signed-in account</Link>}
        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      {accounts.length > 0 && (
        <section>
          <h2>Demo accounts</h2>
          <p className="muted">Click a row to fill the form. Shown only in demo mode.</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Email</th>
                  <th>Password</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((account) => (
                  <tr key={account.email} className="clickable" onClick={() => fill(account)}>
                    <td>
                      {account.fullName}{' '}
                      {account.status === USER_STATUS.DEACTIVATED && (
                        <span className="badge inactive">deactivated: login is refused</span>
                      )}
                    </td>
                    <td>{account.roleLabel}</td>
                    <td>{account.email}</td>
                    <td>
                      <code>{account.password}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
