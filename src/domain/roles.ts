import { PATHS, type AppPath } from './paths';

/**
 * THE single place where roles are defined.
 *
 * To add a role: add one key to ROLE and one entry to ROLE_POLICIES.
 * `Record<Role, RolePolicy>` and `Record<Action, Scope>` make TypeScript refuse
 * to compile until every action has been decided for the new role.
 *
 * No other file compares role strings (`role === 'manager'` is a lint error).
 * Code asks the permission functions in `src/server/auth/permissions.ts` instead.
 */
export const ROLE = {
  IT: 'it',
  MANAGER: 'manager',
  USER: 'user',
} as const;

export type Role = (typeof ROLE)[keyof typeof ROLE];

export const ROLES: readonly Role[] = Object.values(ROLE);

/** Everything a logged-in user may try to do. One action = one column of the permission table. */
export const ACTIONS = [
  'content.view',
  'users.view',
  'users.create',
  'users.editProfile',
  'users.changeRole',
  'users.changeStatus',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * Which target users an action applies to.
 * - `all`: any user (including yourself, unless an invariant forbids it)
 * - `directReports`: only users whose `managerId` is your id (never yourself)
 * - `none`: not allowed at all
 */
export type Scope = 'all' | 'directReports' | 'none';

export type RolePolicy = {
  label: string;
  /** Where this role lands after login and when it opens `/`. */
  homePath: AppPath;
  /** May other users have this user as `managerId`? */
  canHaveReports: boolean;
  /** Rule 4: the system must never end up with zero active users of this role. */
  keepAtLeastOneActive: boolean;
  can: Readonly<Record<Action, Scope>>;
};

/** Roles are NOT hierarchical: IT cannot view content, managers cannot change roles. */
export const ROLE_POLICIES: Readonly<Record<Role, RolePolicy>> = {
  [ROLE.IT]: {
    label: 'IT',
    homePath: PATHS.manageUsers,
    canHaveReports: false,
    keepAtLeastOneActive: true,
    can: {
      'content.view': 'none',
      'users.view': 'all',
      'users.create': 'all',
      'users.editProfile': 'all',
      'users.changeRole': 'all',
      'users.changeStatus': 'all',
    },
  },
  [ROLE.MANAGER]: {
    label: 'Manager',
    homePath: PATHS.content,
    canHaveReports: true,
    keepAtLeastOneActive: false,
    can: {
      'content.view': 'all',
      'users.view': 'directReports',
      'users.create': 'none',
      'users.editProfile': 'directReports',
      'users.changeRole': 'none',
      'users.changeStatus': 'none',
    },
  },
  [ROLE.USER]: {
    label: 'User',
    homePath: PATHS.content,
    canHaveReports: false,
    keepAtLeastOneActive: false,
    can: {
      'content.view': 'all',
      'users.view': 'none',
      'users.create': 'none',
      'users.editProfile': 'none',
      'users.changeRole': 'none',
      'users.changeStatus': 'none',
    },
  },
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
