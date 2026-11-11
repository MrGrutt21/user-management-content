import { describe, expect, it } from 'vitest';

import { ACTIONS, ROLE, ROLES, ROLE_POLICIES, type Action, type Role, type Scope } from '@/domain/roles';
import { USER_STATUS, type User } from '@/domain/types';
import { canActOn, hasCapability } from '@/server/auth/permissions';

/**
 * The permission table from the task, written out literally. This is the spec:
 * when a role is added, add its row here; the coverage test below fails until you do.
 */
const EXPECTED: Record<Role, Record<Action, Scope>> = {
  [ROLE.IT]: {
    'content.view': 'none',
    'users.view': 'all',
    'users.create': 'all',
    'users.editProfile': 'all',
    'users.changeRole': 'all',
    'users.changeStatus': 'all',
  },
  [ROLE.MANAGER]: {
    'content.view': 'all',
    'users.view': 'directReports',
    'users.create': 'none',
    'users.editProfile': 'directReports',
    'users.changeRole': 'none',
    'users.changeStatus': 'none',
  },
  [ROLE.USER]: {
    'content.view': 'all',
    'users.view': 'none',
    'users.create': 'none',
    'users.editProfile': 'none',
    'users.changeRole': 'none',
    'users.changeStatus': 'none',
  },
};

function makeUser(overrides: Partial<User> & Pick<User, 'id' | 'role'>): User {
  return {
    fullName: overrides.id,
    email: `${overrides.id}@example.com`,
    status: USER_STATUS.ACTIVE,
    managerId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ROLE_POLICIES matches the permission table', () => {
  it('covers every role and action', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      expect(Object.keys(ROLE_POLICIES[role].can).sort()).toEqual([...ACTIONS].sort());
    }
  });

  it.each(ROLES.flatMap((role) => ACTIONS.map((action) => [role, action] as const)))(
    '%s / %s',
    (role, action) => {
      expect(ROLE_POLICIES[role].can[action]).toBe(EXPECTED[role][action]);
    },
  );

  it('roles are not hierarchical: IT cannot view content', () => {
    const it_ = makeUser({ id: 'it', role: ROLE.IT });
    expect(hasCapability(it_, 'content.view')).toBe(false);
    expect(hasCapability(it_, 'users.changeStatus')).toBe(true);
  });

  it('exactly the IT role must keep one active member', () => {
    const flagged = ROLES.filter((role) => ROLE_POLICIES[role].keepAtLeastOneActive);
    expect(flagged).toEqual([ROLE.IT]);
  });
});

describe('canActOn: direct reports scope', () => {
  const anna = makeUser({ id: 'anna', role: ROLE.MANAGER });
  const report = makeUser({ id: 'olena', role: ROLE.USER, managerId: 'anna' });
  const otherReport = makeUser({ id: 'dmytro', role: ROLE.USER, managerId: 'bohdan' });
  const otherManager = makeUser({ id: 'bohdan', role: ROLE.MANAGER });
  const unassigned = makeUser({ id: 'kateryna', role: ROLE.USER, managerId: null });
  const ivan = makeUser({ id: 'ivan', role: ROLE.IT });

  it('a manager may edit a direct report', () => {
    expect(canActOn(anna, 'users.editProfile', report)).toBe(true);
  });

  it.each([
    ['another manager’s report', otherReport],
    ['another manager', otherManager],
    ['an unassigned user', unassigned],
    ['themselves', anna],
    ['an IT account', ivan],
  ])('a manager may not edit %s', (_label, target) => {
    expect(canActOn(anna, 'users.editProfile', target)).toBe(false);
  });

  it('a manager cannot change roles or statuses, even of a direct report', () => {
    expect(canActOn(anna, 'users.changeRole', report)).toBe(false);
    expect(canActOn(anna, 'users.changeStatus', report)).toBe(false);
  });

  it('IT may act on anyone, including itself (invariants are checked elsewhere)', () => {
    for (const target of [anna, report, otherReport, unassigned, ivan]) {
      expect(canActOn(ivan, 'users.editProfile', target)).toBe(true);
    }
  });

  it('a user may act on nobody', () => {
    for (const target of [anna, report, unassigned]) {
      expect(canActOn(report, 'users.editProfile', target)).toBe(false);
      expect(canActOn(report, 'users.view', target)).toBe(false);
    }
  });
});
