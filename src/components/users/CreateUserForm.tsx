'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import type { User } from '@/domain/types';
import { apiFetch } from '@/lib/api-client';

import { errorMessage, fieldErrors } from './api-errors';
import type { ManagerOption, RoleOption } from './types';

type Props = { roleOptions: readonly RoleOption[]; managerOptions: readonly ManagerOption[] };

export function CreateUserForm({ roleOptions, managerOptions }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Read the form now: React clears currentTarget once the handler yields at `await`.
    const form = event.currentTarget;
    const data = new FormData(form);
    const field = (name: string) => String(data.get(name) ?? '');

    setBusy(true);
    setErrors({});
    setResult(null);
    try {
      const user = await apiFetch<User>('/api/users', {
        method: 'POST',
        body: {
          fullName: field('fullName'),
          email: field('email'),
          role: field('role'),
          managerId: field('managerId') || null,
          password: field('password'),
        },
      });
      form.reset();
      setResult({ ok: true, text: `Created ${user.fullName}` });
      router.refresh();
    } catch (error) {
      const byField = fieldErrors(error);
      setErrors(byField);
      if (Object.keys(byField).length === 0) setResult({ ok: false, text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Create user</h2>
      <form className="stack" onSubmit={submit}>
        <label>
          Full name
          <input name="fullName" required />
          <FieldError text={errors.fullName} />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
          <FieldError text={errors.email} />
        </label>
        <label>
          Role
          <select name="role" required defaultValue="">
            <option value="" disabled>Choose a role</option>
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <FieldError text={errors.role} />
        </label>
        <label>
          Manager
          <select name="managerId" defaultValue="">
            <option value="">No manager</option>
            {managerOptions.map((manager) => (
              <option key={manager.id} value={manager.id}>{manager.fullName}</option>
            ))}
          </select>
          <FieldError text={errors.managerId} />
        </label>
        <label>
          Password
          <input name="password" type="password" autoComplete="new-password" required />
          <FieldError text={errors.password} />
        </label>
        <button type="submit" disabled={busy}>Create user</button>
        {result && <p className={result.ok ? 'success' : 'error'}>{result.text}</p>}
      </form>
    </section>
  );
}

function FieldError({ text }: { text: string | undefined }) {
  return text ? <small className="error">{text}</small> : null;
}
