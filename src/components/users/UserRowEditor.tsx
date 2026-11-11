'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';

import { ERROR_CODE, type Decision } from '@/domain/errors';
import { USER_STATUS, type UserRow } from '@/domain/types';
import { userResponse } from '@/domain/responses';
import { apiFetch } from '@/lib/api-client';

import { errorMessage } from './api-errors';
import type { RoleOption } from './types';

type Props = { row: UserRow; roleOptions: readonly RoleOption[] };

/** One row of /manage-users. Shows only what `row.allowed` (computed on the server) permits. */
export function UserRowEditor({ row, roleOptions }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(row.fullName);
  const [email, setEmail] = useState(row.email);
  const [role, setRole] = useState<string>(row.role);

  const userPath = `/api/users/${encodeURIComponent(row.id)}`;
  const isActive = row.status === USER_STATUS.ACTIVE;
  const roleLabel = roleOptions.find((option) => option.value === row.role)?.label ?? row.role;

  async function mutate(path: string, body: unknown): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(path, userResponse, { method: 'PATCH', body });
      router.refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function startEditing() {
    setFullName(row.fullName);
    setEmail(row.email);
    setError(null);
    setEditing(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await mutate(userPath, { fullName, email })) setEditing(false);
  }

  function toggleStatus() {
    if (isActive && !window.confirm(`Deactivate ${row.fullName}? They will be signed out immediately.`)) return;
    void mutate(`${userPath}/status`, { status: isActive ? USER_STATUS.DEACTIVATED : USER_STATUS.ACTIVE });
  }

  return (
    <>
      <tr>
        <td>
          {editing ? (
            <form className="row" onSubmit={saveProfile}>
              <input aria-label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
              <input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <button type="submit" disabled={busy}>Save</button>
              <button type="button" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            </form>
          ) : (
            <div className="row">
              <span>
                {row.fullName}
                <br />
                <span className="muted">{row.email}</span>
              </span>
              <Gate
                decision={row.allowed.editProfile}
                control={(disabled) => (
                  <button type="button" onClick={startEditing} disabled={disabled || busy}>Edit</button>
                )}
              />
            </div>
          )}
        </td>
        <td>
          <Gate
            decision={row.allowed.changeRole}
            fallback={roleLabel}
            control={(disabled) => (
              <span className="row">
                <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value)} disabled={disabled || busy}>
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void mutate(`${userPath}/role`, { role })}
                  disabled={disabled || busy || role === row.role}
                >
                  Change
                </button>
              </span>
            )}
          />
        </td>
        <td>
          <div className="row">
            <span className={isActive ? 'badge' : 'badge inactive'}>{row.status}</span>
            <Gate
              decision={row.allowed.changeStatus}
              control={(disabled) => (
                <button type="button" onClick={toggleStatus} disabled={disabled || busy}>
                  {isActive ? 'Deactivate' : 'Activate'}
                </button>
              )}
            />
          </div>
        </td>
        <td>{row.managerName ?? '—'}</td>
      </tr>
      {error && (
        <tr>
          <td colSpan={4} className="error">{error}</td>
        </tr>
      )}
    </>
  );
}

type GateProps = { decision: Decision; fallback?: ReactNode; control: (disabled: boolean) => ReactNode };

/**
 * How a server Decision is shown. Allowed: the control. FORBIDDEN (the role simply cannot
 * do this): `fallback` as plain text. Any other denial (yourself, last active member):
 * the control disabled, with the server's reason next to it.
 */
function Gate({ decision, fallback = null, control }: GateProps) {
  if (decision.allowed) return control(false);
  if (decision.code === ERROR_CODE.FORBIDDEN) return fallback;
  return (
    <>
      {control(true)}
      <small className="muted">{decision.message}</small>
    </>
  );
}
