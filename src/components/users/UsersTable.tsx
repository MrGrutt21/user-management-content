'use client';

import type { UserRow } from '@/domain/types';

import type { RoleOption } from './types';
import { UserRowEditor } from './UserRowEditor';

type Props = { rows: readonly UserRow[]; roleOptions: readonly RoleOption[] };

export function UsersTable({ rows, roleOptions }: Props) {
  if (rows.length === 0) return <p className="muted">No users to show.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name / email</th>
            <th>Role</th>
            <th>Status</th>
            <th>Manager</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <UserRowEditor key={row.id} row={row} roleOptions={roleOptions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
