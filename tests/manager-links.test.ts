import { beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODE, type ErrorCode } from '@/domain/errors';
import { ROLE, ROLES, ROLE_POLICIES } from '@/domain/roles';
import { createUserSchema, type CreateUserInput } from '@/domain/schemas';
import { USER_STATUS, type User } from '@/domain/types';
import { canActOn } from '@/server/auth/permissions';
import { createSession, resolveSession } from '@/server/auth/session';
import { getStore, resetStore } from '@/server/db/store';
import { AppError } from '@/server/http/errors';
import {
  changeRole,
  changeStatus,
  createUser,
  listAssignableManagers,
  listVisibleUsers,
  updateProfile,
} from '@/server/users/user-service';

/**
 * Who reports to whom (`managerId`), and what happens to those links when people change role
 * or are deactivated. Users are never deleted: there is no delete endpoint, only deactivation.
 */

function user(id: string): User {
  const found = getStore().users.get(id);
  if (!found) throw new Error(`No user ${id} in the store`);
  return found;
}

function errorCode(run: () => unknown): ErrorCode | 'no error' {
  try {
    run();
    return 'no error';
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
}

function newUserInput(overrides: Partial<CreateUserInput>): CreateUserInput {
  return createUserSchema.parse({
    fullName: 'Petro Ivanenko',
    email: 'petro@example.com',
    role: ROLE.USER,
    managerId: null,
    password: 'petro123',
    ...overrides,
  });
}

/** Every managerId in the store must satisfy the two policy flags. Checked after each scenario. */
function expectLinksConsistent(): void {
  for (const member of getStore().users.values()) {
    if (member.managerId === null) continue;
    expect(ROLE_POLICIES[member.role].canHaveManager, `${member.id} may not have a manager`).toBe(true);
    expect(getStore().users.has(member.managerId), `${member.id} points to a missing user`).toBe(true);
  }
}

beforeEach(() => {
  resetStore();
});

describe('policy flags', () => {
  it('only the user role may have a manager; only the manager role may have reports', () => {
    expect(ROLES.filter((role) => ROLE_POLICIES[role].canHaveManager)).toEqual([ROLE.USER]);
    expect(ROLES.filter((role) => ROLE_POLICIES[role].canHaveReports)).toEqual([ROLE.MANAGER]);
  });

  it('the seed already follows them', () => {
    expectLinksConsistent();
    for (const member of getStore().users.values()) {
      if (member.managerId === null) continue;
      expect(ROLE_POLICIES[user(member.managerId).role].canHaveReports).toBe(true);
    }
  });
});

describe('creating a user with a manager', () => {
  it.each([
    ['an IT account', ROLE.IT],
    ['a manager', ROLE.MANAGER],
  ])('%s with a managerId is INVALID_MANAGER, and nothing is created', (_label, role) => {
    const before = getStore().users.size;
    expect(errorCode(() => createUser(user('usr_ivan'), newUserInput({ role, managerId: 'usr_anna' })))).toBe(
      ERROR_CODE.INVALID_MANAGER,
    );
    expect(getStore().users.size).toBe(before);
  });

  it.each([
    ['an IT account', ROLE.IT],
    ['a manager', ROLE.MANAGER],
  ])('%s without a manager is fine', (_label, role) => {
    expect(createUser(user('usr_ivan'), newUserInput({ role })).managerId).toBeNull();
  });

  it('nobody can be put under an IT account or a user, active or not', () => {
    for (const managerId of ['usr_ivan', 'usr_olena', 'usr_maksym']) {
      expect(errorCode(() => createUser(user('usr_ivan'), newUserInput({ managerId })))).toBe(ERROR_CODE.INVALID_MANAGER);
    }
  });

  it('the manager options offered to IT are exactly the active managers', () => {
    expect(listAssignableManagers().map((option) => option.id)).toEqual(['usr_anna', 'usr_bohdan', 'usr_marta']);
  });
});

describe('a user who changes role', () => {
  it('promoted to manager: the managerId is cleared and the old manager loses them', () => {
    const promoted = changeRole(user('usr_ivan'), 'usr_olena', ROLE.MANAGER);
    expect(promoted.managerId).toBeNull();
    expect(listVisibleUsers(user('usr_anna')).map((row) => row.id)).not.toContain('usr_olena');
    expect(errorCode(() => updateProfile(user('usr_anna'), 'usr_olena', { fullName: 'X' }))).toBe(ERROR_CODE.FORBIDDEN);
    expectLinksConsistent();
  });

  it('promoted to IT: the managerId is cleared too', () => {
    expect(changeRole(user('usr_ivan'), 'usr_taras', ROLE.IT).managerId).toBeNull();
    expectLinksConsistent();
  });

  it('back to user later: the old manager is not restored (IT would have to recreate the link)', () => {
    changeRole(user('usr_ivan'), 'usr_olena', ROLE.MANAGER);
    expect(changeRole(user('usr_ivan'), 'usr_olena', ROLE.USER).managerId).toBeNull();
  });

  it('setting the same role again changes nothing, the manager stays', () => {
    expect(changeRole(user('usr_ivan'), 'usr_olena', ROLE.USER).managerId).toBe('usr_anna');
  });
});

describe('a manager who changes role keeps their reports linked (decided: leave as is)', () => {
  it('Anna demoted to user: her reports keep managerId, she sees nobody, IT still edits them', () => {
    const { token } = createSession('usr_anna');
    changeRole(user('usr_ivan'), 'usr_anna', ROLE.USER);

    for (const id of ['usr_olena', 'usr_taras', 'usr_sofia', 'usr_andriy']) {
      expect(user(id).managerId).toBe('usr_anna');
    }
    // Her session is still valid, but with the new role on the very next request.
    const anna = resolveSession(token);
    expect(anna?.role).toBe(ROLE.USER);
    expect(listVisibleUsers(user('usr_anna'))).toEqual([]);
    expect(errorCode(() => updateProfile(user('usr_anna'), 'usr_olena', { fullName: 'X' }))).toBe(ERROR_CODE.FORBIDDEN);
    expect(updateProfile(user('usr_ivan'), 'usr_olena', { fullName: 'Olena K.' }).fullName).toBe('Olena K.');
    // A user can't have reports, so nobody new can be put under her.
    expect(listAssignableManagers().map((option) => option.id)).not.toContain('usr_anna');
  });

  it('Anna made manager again: the same four reports are hers again', () => {
    changeRole(user('usr_ivan'), 'usr_anna', ROLE.USER);
    changeRole(user('usr_ivan'), 'usr_anna', ROLE.MANAGER);
    expect(listVisibleUsers(user('usr_anna'))).toHaveLength(4);
  });

  it('Anna promoted to IT: she sees everyone through her new role, not through the links', () => {
    changeRole(user('usr_ivan'), 'usr_anna', ROLE.IT);
    expect(user('usr_anna').managerId).toBeNull();
    expect(listVisibleUsers(user('usr_anna'))).toHaveLength(getStore().users.size);
  });

  it('a non-manager whose id is still someone’s managerId gets no access from it', () => {
    changeRole(user('usr_ivan'), 'usr_anna', ROLE.USER);
    expect(canActOn(user('usr_anna'), 'users.editProfile', user('usr_olena'))).toBe(false);
  });
});

describe('a manager who is deactivated', () => {
  it('reports keep the link, Anna is signed out, IT still manages them', () => {
    const { token } = createSession('usr_anna');
    changeStatus(user('usr_ivan'), 'usr_anna', USER_STATUS.DEACTIVATED);

    expect(resolveSession(token)).toBeNull();
    expect(user('usr_olena').managerId).toBe('usr_anna');
    expect(updateProfile(user('usr_ivan'), 'usr_olena', { email: 'olena.k@example.com' }).email).toBe('olena.k@example.com');
    // Nobody new can be placed under a deactivated manager.
    expect(errorCode(() => createUser(user('usr_ivan'), newUserInput({ managerId: 'usr_anna' })))).toBe(
      ERROR_CODE.INVALID_MANAGER,
    );
  });

  it('reactivated: she manages the same people again, with a fresh login', () => {
    changeStatus(user('usr_ivan'), 'usr_anna', USER_STATUS.DEACTIVATED);
    changeStatus(user('usr_ivan'), 'usr_anna', USER_STATUS.ACTIVE);
    expect(listVisibleUsers(user('usr_anna'))).toHaveLength(4);
  });

  it('Yulia, whose manager Serhii is deactivated, is editable only by IT', () => {
    for (const manager of ['usr_anna', 'usr_bohdan', 'usr_marta']) {
      expect(errorCode(() => updateProfile(user(manager), 'usr_yulia', { fullName: 'X' }))).toBe(ERROR_CODE.FORBIDDEN);
    }
    expect(updateProfile(user('usr_iryna'), 'usr_yulia', { fullName: 'Yulia M.' }).fullName).toBe('Yulia M.');
  });
});

describe('a deactivated IT and the users around them', () => {
  it('nobody reports to IT, so deactivating Iryna touches no one else', () => {
    const before = [...getStore().users.values()].filter((member) => member.id !== 'usr_iryna');
    changeStatus(user('usr_ivan'), 'usr_iryna', USER_STATUS.DEACTIVATED);
    const after = [...getStore().users.values()].filter((member) => member.id !== 'usr_iryna');
    expect(after).toEqual(before);
  });

  it('the users an IT created stay as they are after that IT is deactivated', () => {
    const created = createUser(user('usr_iryna'), newUserInput({ managerId: 'usr_marta' }));
    changeStatus(user('usr_ivan'), 'usr_iryna', USER_STATUS.DEACTIVATED);
    expect(user(created.id)).toEqual(created);
  });
});
