import { beforeEach, describe, expect, it } from 'vitest';

import { ERROR_CODE, type Decision, type ErrorCode } from '@/domain/errors';
import { ROLE, ROLES } from '@/domain/roles';
import { createUserSchema, updateProfileSchema, type CreateUserInput } from '@/domain/schemas';
import { USER_STATUS, type User } from '@/domain/types';
import { login } from '@/server/auth/auth-service';
import { createSession, resolveSession } from '@/server/auth/session';
import { getStore, resetStore } from '@/server/db/store';
import { AppError } from '@/server/http/errors';
import {
  changeRole,
  changeStatus,
  createUser,
  listVisibleUsers,
  updateProfile,
} from '@/server/users/user-service';

/**
 * The five rules of the task, checked at the service level with the seeded accounts.
 * Every mutation goes through the same function the route handlers call, so what passes
 * here is what the API enforces (tests/api.test.ts covers the HTTP layer on top).
 */

/** The current version of a seeded user. Re-read after every mutation: the store replaces objects. */
function user(id: string): User {
  const found = getStore().users.get(id);
  if (!found) throw new Error(`No user ${id} in the store`);
  return found;
}

/** Run a mutation that must fail and return the AppError it threw. */
function expectAppError(run: () => unknown, code: ErrorCode): AppError {
  let caught: unknown;
  try {
    run();
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof AppError)) {
    throw new Error(`Expected AppError ${code}, got ${caught === undefined ? 'no error' : String(caught)}`);
  }
  expect(caught.code).toBe(code);
  return caught;
}

/** What a mutation actually did, in the same shape as the `allowed` flags. */
function outcome(run: () => unknown): { allowed: true } | { allowed: false; code: ErrorCode } {
  try {
    run();
    return { allowed: true };
  } catch (error) {
    if (error instanceof AppError) return { allowed: false, code: error.code };
    throw error;
  }
}

function withoutMessage(decision: Decision): { allowed: true } | { allowed: false; code: ErrorCode } {
  return decision.allowed ? { allowed: true } : { allowed: false, code: decision.code };
}

function newUserInput(overrides: Partial<CreateUserInput> = {}): CreateUserInput {
  return createUserSchema.parse({
    fullName: 'Petro Ivanenko',
    email: 'petro@example.com',
    role: ROLE.USER,
    managerId: 'usr_marta',
    password: 'petro123',
    ...overrides,
  });
}

beforeEach(() => {
  resetStore();
});

describe('Rule 1: only IT creates users and changes roles and statuses', () => {
  it('IT can do all three', () => {
    const ivan = user('usr_ivan');
    const created = createUser(ivan, newUserInput());
    expect(user(created.id).status).toBe(USER_STATUS.ACTIVE);

    expect(changeRole(ivan, 'usr_olena', ROLE.MANAGER).role).toBe(ROLE.MANAGER);
    expect(changeStatus(ivan, 'usr_taras', USER_STATUS.DEACTIVATED).status).toBe(USER_STATUS.DEACTIVATED);
  });

  it.each([
    ['a manager', 'usr_anna'],
    ['a user', 'usr_olena'],
  ])('%s cannot create a user', (_label, actorId) => {
    expectAppError(() => createUser(user(actorId), newUserInput()), ERROR_CODE.FORBIDDEN);
    expect([...getStore().users.values()].some((u) => u.email === 'petro@example.com')).toBe(false);
  });

  it.each([
    ['a manager, even for a direct report', 'usr_anna', 'usr_olena'],
    ['a manager, for themselves', 'usr_anna', 'usr_anna'],
    ['a user, for a colleague', 'usr_olena', 'usr_taras'],
    ['a user, for themselves', 'usr_olena', 'usr_olena'],
  ])('%s cannot change a role', (_label, actorId, targetId) => {
    const before = user(targetId).role;
    expectAppError(() => changeRole(user(actorId), targetId, ROLE.IT), ERROR_CODE.FORBIDDEN);
    expect(user(targetId).role).toBe(before);
  });

  it.each([
    ['a manager, even for a direct report', 'usr_anna', 'usr_olena'],
    ['a manager, for themselves', 'usr_anna', 'usr_anna'],
    ['a user, for a colleague', 'usr_olena', 'usr_taras'],
    ['a user, for themselves', 'usr_olena', 'usr_olena'],
  ])('%s cannot change a status', (_label, actorId, targetId) => {
    expectAppError(() => changeStatus(user(actorId), targetId, USER_STATUS.DEACTIVATED), ERROR_CODE.FORBIDDEN);
    expect(user(targetId).status).toBe(USER_STATUS.ACTIVE);
  });

  it('a manager cannot reactivate a deactivated report either', () => {
    expectAppError(() => changeStatus(user('usr_bohdan'), 'usr_maksym', USER_STATUS.ACTIVE), ERROR_CODE.FORBIDDEN);
  });
});

describe('Rule 2: a manager edits only the name and email of their direct reports', () => {
  it('Anna edits the name and email of Olena, her direct report', () => {
    const updated = updateProfile(user('usr_anna'), 'usr_olena', {
      fullName: 'Olena Kravchenko-Bondar',
      email: 'olena.k@example.com',
    });
    expect(updated).toMatchObject({ fullName: 'Olena Kravchenko-Bondar', email: 'olena.k@example.com' });
    expect(user('usr_olena')).toMatchObject({ fullName: 'Olena Kravchenko-Bondar', role: ROLE.USER, managerId: 'usr_anna' });
  });

  it.each([
    ['Dmytro, a report of another manager', 'usr_dmytro'],
    ['Bohdan, another manager', 'usr_bohdan'],
    ['herself', 'usr_anna'],
    ['Kateryna, who has no manager', 'usr_kateryna'],
    ['Yulia, a report of a deactivated manager', 'usr_yulia'],
    ['Ivan, an IT account', 'usr_ivan'],
  ])('Anna cannot edit %s', (_label, targetId) => {
    const before = user(targetId);
    expectAppError(() => updateProfile(user('usr_anna'), targetId, { fullName: 'Changed' }), ERROR_CODE.FORBIDDEN);
    expect(user(targetId)).toEqual(before);
  });

  it('Marta, a manager with no reports, can edit nobody', () => {
    for (const target of getStore().users.values()) {
      expectAppError(() => updateProfile(user('usr_marta'), target.id, { fullName: 'Changed' }), ERROR_CODE.FORBIDDEN);
    }
  });

  it('a user cannot edit anyone, not even themselves', () => {
    expectAppError(() => updateProfile(user('usr_olena'), 'usr_olena', { fullName: 'Changed' }), ERROR_CODE.FORBIDDEN);
    expectAppError(() => updateProfile(user('usr_olena'), 'usr_taras', { fullName: 'Changed' }), ERROR_CODE.FORBIDDEN);
  });

  it('IT edits anyone, including itself', () => {
    const ivan = user('usr_ivan');
    for (const target of [...getStore().users.values()]) {
      updateProfile(ivan, target.id, { fullName: `${target.fullName} (edited)` });
      expect(user(target.id).fullName).toBe(`${target.fullName} (edited)`);
    }
    expect(updateProfile(ivan, 'usr_ivan', { email: 'ivan.p@example.com' }).email).toBe('ivan.p@example.com');
  });

  it('an email used by another account is EMAIL_TAKEN, whatever its case in the request', () => {
    // The schema trims and lower-cases, so the service only ever sees the normalised address.
    const input = updateProfileSchema.parse({ email: '  TARAS@Example.com ' });
    expect(input.email).toBe('taras@example.com');
    expectAppError(() => updateProfile(user('usr_anna'), 'usr_olena', input), ERROR_CODE.EMAIL_TAKEN);
    expectAppError(() => updateProfile(user('usr_ivan'), 'usr_olena', { email: 'anna@example.com' }), ERROR_CODE.EMAIL_TAKEN);
    expect(user('usr_olena').email).toBe('olena@example.com');
  });

  it('saving your own unchanged email is not EMAIL_TAKEN', () => {
    expect(updateProfile(user('usr_anna'), 'usr_olena', { email: 'olena@example.com' }).email).toBe('olena@example.com');
  });

  it('an unknown user id is NOT_FOUND', () => {
    expectAppError(() => updateProfile(user('usr_ivan'), 'usr_nobody', { fullName: 'X' }), ERROR_CODE.NOT_FOUND);
  });
});

describe('Rule 3: IT cannot deactivate itself or change its own role', () => {
  it('Ivan cannot deactivate himself while Iryna is active', () => {
    expectAppError(() => changeStatus(user('usr_ivan'), 'usr_ivan', USER_STATUS.DEACTIVATED), ERROR_CODE.CANNOT_DEACTIVATE_SELF);
    expect(user('usr_ivan').status).toBe(USER_STATUS.ACTIVE);
  });

  it.each(ROLES.filter((role) => role !== ROLE.IT))('Ivan cannot change his own role to %s', (role) => {
    expectAppError(() => changeRole(user('usr_ivan'), 'usr_ivan', role), ERROR_CODE.CANNOT_CHANGE_OWN_ROLE);
    expect(user('usr_ivan').role).toBe(ROLE.IT);
  });

  it('Ivan may still change the role and status of Iryna', () => {
    expect(changeRole(user('usr_ivan'), 'usr_iryna', ROLE.MANAGER).role).toBe(ROLE.MANAGER);
    expect(changeStatus(user('usr_ivan'), 'usr_iryna', USER_STATUS.DEACTIVATED).status).toBe(USER_STATUS.DEACTIVATED);
  });
});

describe('Rule 4: there is always at least one active IT', () => {
  it('the task scenario, step by step', () => {
    const ivan = user('usr_ivan');

    // 1. Iryna is still active, so the problem is that it is Ivan himself.
    expectAppError(() => changeStatus(ivan, 'usr_ivan', USER_STATUS.DEACTIVATED), ERROR_CODE.CANNOT_DEACTIVATE_SELF);

    // 2. Deactivating the other IT is fine.
    expect(changeStatus(ivan, 'usr_iryna', USER_STATUS.DEACTIVATED).status).toBe(USER_STATUS.DEACTIVATED);

    // 3. Now Ivan is the last active IT, and that check comes first.
    expectAppError(() => changeStatus(ivan, 'usr_ivan', USER_STATUS.DEACTIVATED), ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER);

    // 4. Changing his own role would also leave no active IT.
    expectAppError(() => changeRole(ivan, 'usr_ivan', ROLE.MANAGER), ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER);

    // 5. Reactivating Iryna is always allowed, and lifts the block.
    expect(changeStatus(ivan, 'usr_iryna', USER_STATUS.ACTIVE).status).toBe(USER_STATUS.ACTIVE);
    expectAppError(() => changeStatus(ivan, 'usr_ivan', USER_STATUS.DEACTIVATED), ERROR_CODE.CANNOT_DEACTIVATE_SELF);
  });

  it('demoting the other IT counts the same as deactivating them', () => {
    const ivan = user('usr_ivan');
    changeRole(ivan, 'usr_iryna', ROLE.MANAGER);
    expectAppError(() => changeStatus(ivan, 'usr_ivan', USER_STATUS.DEACTIVATED), ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER);
  });

  it('with a third IT the count goes down to one, and that one is protected whoever it is', () => {
    const olha = createUser(user('usr_ivan'), newUserInput({ fullName: 'Olha Savchenko', email: 'olha@example.com', role: ROLE.IT, managerId: null }));

    // Three active IT: after Iryna leaves there are still two, so Ivan is only blocked as "yourself".
    changeStatus(user(olha.id), 'usr_iryna', USER_STATUS.DEACTIVATED);
    expectAppError(() => changeStatus(user('usr_ivan'), 'usr_ivan', USER_STATUS.DEACTIVATED), ERROR_CODE.CANNOT_DEACTIVATE_SELF);

    // Olha demotes Ivan: allowed, she is still active.
    changeRole(user(olha.id), 'usr_ivan', ROLE.MANAGER);

    // Olha is now the last active IT.
    expectAppError(() => changeStatus(user(olha.id), olha.id, USER_STATUS.DEACTIVATED), ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER);
    expectAppError(() => changeRole(user(olha.id), olha.id, ROLE.USER), ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER);
    const activeIt = [...getStore().users.values()].filter((u) => u.role === ROLE.IT && u.status === USER_STATUS.ACTIVE);
    expect(activeIt.map((u) => u.id)).toEqual([olha.id]);
  });

  it('two IT deactivating each other: the second one is refused, even with a stale actor', () => {
    const ivan = user('usr_ivan');
    const iryna = user('usr_iryna');
    changeStatus(ivan, 'usr_iryna', USER_STATUS.DEACTIVATED);
    // `iryna` still says "active", but the check reads the store.
    expectAppError(() => changeStatus(iryna, 'usr_ivan', USER_STATUS.DEACTIVATED), ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER);
    expect(user('usr_ivan').status).toBe(USER_STATUS.ACTIVE);
  });

  it('a deactivated IT is not an active member, so changing their role is allowed', () => {
    changeStatus(user('usr_ivan'), 'usr_iryna', USER_STATUS.DEACTIVATED);
    expect(changeRole(user('usr_ivan'), 'usr_iryna', ROLE.USER).role).toBe(ROLE.USER);
  });

  it('roles without the flag may lose every active member', () => {
    const ivan = user('usr_ivan');
    for (const id of ['usr_anna', 'usr_bohdan', 'usr_marta']) {
      changeStatus(ivan, id, USER_STATUS.DEACTIVATED);
    }
    const activeManagers = [...getStore().users.values()].filter((u) => u.role === ROLE.MANAGER && u.status === USER_STATUS.ACTIVE);
    expect(activeManagers).toHaveLength(0);
  });
});

describe('Rule 5: deactivation ends the user’s sessions at once', () => {
  it('an existing session of the deactivated user resolves to nobody on the next request', () => {
    const first = createSession('usr_olena');
    const second = createSession('usr_olena');
    const colleague = createSession('usr_taras');
    expect(resolveSession(first.token)?.id).toBe('usr_olena');

    changeStatus(user('usr_ivan'), 'usr_olena', USER_STATUS.DEACTIVATED);

    expect(resolveSession(first.token)).toBeNull();
    expect(resolveSession(second.token)).toBeNull();
    expect(resolveSession(colleague.token)?.id).toBe('usr_taras');
    const olenaSessions = [...getStore().sessions.values()].filter((session) => session.userId === 'usr_olena');
    expect(olenaSessions).toHaveLength(0);
  });

  it('a deactivated user cannot log in, and reactivation does not revive old sessions', () => {
    const { token } = login({ email: 'olena@example.com', password: 'olena123' });
    changeStatus(user('usr_ivan'), 'usr_olena', USER_STATUS.DEACTIVATED);
    expectAppError(() => login({ email: 'olena@example.com', password: 'olena123' }), ERROR_CODE.ACCOUNT_DEACTIVATED);

    changeStatus(user('usr_ivan'), 'usr_olena', USER_STATUS.ACTIVE);
    expect(resolveSession(token)).toBeNull();
    const fresh = login({ email: 'olena@example.com', password: 'olena123' });
    expect(resolveSession(fresh.token)?.id).toBe('usr_olena');
  });

  it('a role change applies to an existing session without logging in again', () => {
    const { token } = createSession('usr_olena');
    changeRole(user('usr_ivan'), 'usr_olena', ROLE.MANAGER);
    expect(resolveSession(token)?.role).toBe(ROLE.MANAGER);
  });
});

describe('createUser', () => {
  it('creates an active user who can log in with the given password', () => {
    const created = createUser(user('usr_ivan'), newUserInput());
    expect(created).toMatchObject({
      fullName: 'Petro Ivanenko',
      email: 'petro@example.com',
      role: ROLE.USER,
      status: USER_STATUS.ACTIVE,
      managerId: 'usr_marta',
    });
    expect(created).not.toHaveProperty('password');
    expect(created.id).toMatch(/^usr_/);

    const session = login({ email: 'petro@example.com', password: 'petro123' });
    expect(session.user.id).toBe(created.id);
    expectAppError(() => login({ email: 'petro@example.com', password: 'wrong-password' }), ERROR_CODE.INVALID_CREDENTIALS);
  });

  it('the new report becomes editable by their manager', () => {
    const created = createUser(user('usr_ivan'), newUserInput());
    expect(listVisibleUsers(user('usr_marta')).map((row) => row.id)).toEqual([created.id]);
    expect(updateProfile(user('usr_marta'), created.id, { fullName: 'Petro I.' }).fullName).toBe('Petro I.');
  });

  it('may have no manager', () => {
    expect(createUser(user('usr_ivan'), newUserInput({ managerId: null })).managerId).toBeNull();
  });

  it.each([
    ['a deactivated manager (Serhii)', 'usr_serhii'],
    ['a user who is not a manager (Olena)', 'usr_olena'],
    ['an IT account, whose role cannot have reports (Iryna)', 'usr_iryna'],
    ['an id that does not exist', 'usr_nobody'],
  ])('rejects %s as the manager with INVALID_MANAGER', (_label, managerId) => {
    const countBefore = getStore().users.size;
    expectAppError(() => createUser(user('usr_ivan'), newUserInput({ managerId })), ERROR_CODE.INVALID_MANAGER);
    expect(getStore().users.size).toBe(countBefore);
  });

  it('rejects an email that is already used with EMAIL_TAKEN', () => {
    const input = newUserInput({ email: ' Anna@Example.COM ' });
    expect(input.email).toBe('anna@example.com');
    expectAppError(() => createUser(user('usr_ivan'), input), ERROR_CODE.EMAIL_TAKEN);
  });
});

describe('listVisibleUsers', () => {
  it('Anna sees exactly her four direct reports, not herself', () => {
    const ids = listVisibleUsers(user('usr_anna')).map((row) => row.id);
    expect(ids.sort()).toEqual(['usr_andriy', 'usr_olena', 'usr_sofia', 'usr_taras']);
  });

  it('Bohdan sees his deactivated report too; Marta sees nobody', () => {
    expect(listVisibleUsers(user('usr_bohdan')).map((row) => row.id).sort()).toEqual(['usr_dmytro', 'usr_maksym']);
    expect(listVisibleUsers(user('usr_marta'))).toEqual([]);
  });

  it('IT sees all 14 accounts, itself included', () => {
    const rows = listVisibleUsers(user('usr_ivan'));
    expect(rows).toHaveLength(14);
    expect(rows.map((row) => row.id)).toContain('usr_ivan');
  });

  it('a user sees nobody', () => {
    expect(listVisibleUsers(user('usr_olena'))).toEqual([]);
  });

  it('rows never carry a password', () => {
    for (const row of listVisibleUsers(user('usr_ivan'))) {
      expect(row).not.toHaveProperty('password');
    }
  });

  it('on Ivan’s own row: profile yes, role and status no, and the reason changes once he is the last IT', () => {
    const ownRow = () => {
      const row = listVisibleUsers(user('usr_ivan')).find((r) => r.id === 'usr_ivan');
      if (!row) throw new Error('Ivan does not see himself');
      return row;
    };

    expect(ownRow().allowed.editProfile.allowed).toBe(true);
    expect(ownRow().allowed.changeRole).toMatchObject({ allowed: false, code: ERROR_CODE.CANNOT_CHANGE_OWN_ROLE });
    expect(ownRow().allowed.changeStatus).toMatchObject({ allowed: false, code: ERROR_CODE.CANNOT_DEACTIVATE_SELF });

    changeStatus(user('usr_ivan'), 'usr_iryna', USER_STATUS.DEACTIVATED);

    expect(ownRow().allowed.changeRole).toMatchObject({ allowed: false, code: ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER });
    expect(ownRow().allowed.changeStatus).toMatchObject({ allowed: false, code: ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER });
  });

  it('on Anna’s rows: profile yes, role and status FORBIDDEN', () => {
    for (const row of listVisibleUsers(user('usr_anna'))) {
      expect(row.allowed.editProfile.allowed).toBe(true);
      expect(row.allowed.changeRole).toMatchObject({ allowed: false, code: ERROR_CODE.FORBIDDEN });
      expect(row.allowed.changeStatus).toMatchObject({ allowed: false, code: ERROR_CODE.FORBIDDEN });
    }
  });

  it('every flag IT sees matches what the mutation then actually does', () => {
    const targetIds = listVisibleUsers(user('usr_ivan')).map((row) => row.id);
    for (const targetId of targetIds) {
      for (const column of ['changeRole', 'changeStatus'] as const) {
        resetStore();
        const row = listVisibleUsers(user('usr_ivan')).find((r) => r.id === targetId);
        if (!row) throw new Error(`Ivan does not see ${targetId}`);
        // The row is computed for "any other role" and "the opposite status".
        const nextRole = ROLES.find((role) => role !== row.role) ?? row.role;
        const nextStatus = row.status === USER_STATUS.ACTIVE ? USER_STATUS.DEACTIVATED : USER_STATUS.ACTIVE;
        const actual =
          column === 'changeRole'
            ? outcome(() => changeRole(user('usr_ivan'), targetId, nextRole))
            : outcome(() => changeStatus(user('usr_ivan'), targetId, nextStatus));
        expect({ targetId, column, ...withoutMessage(row.allowed[column]) }).toEqual({ targetId, column, ...actual });
      }
    }
  });
});
