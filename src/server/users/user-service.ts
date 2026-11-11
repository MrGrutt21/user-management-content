import 'server-only';

import { randomUUID } from 'node:crypto';

import { ERROR_CODE } from '@/domain/errors';
import { ROLES, ROLE_POLICIES, type Role } from '@/domain/roles';
import type { CreateUserInput, UpdateProfileInput } from '@/domain/schemas';
import { USER_STATUS, type Me, type User, type UserRow, type UserStatus } from '@/domain/types';
import { canActOn } from '@/server/auth/permissions';
import { revokeUserSessions } from '@/server/auth/session';
import { getStore } from '@/server/db/store';
import { AppError, enforce } from '@/server/http/errors';

import {
  canHaveReportsNow,
  checkChangeRole,
  checkChangeStatus,
  checkCreate,
  checkEditProfile,
  checkEmailAvailable,
  checkManagerAssignable,
} from './user-rules';

/**
 * User use cases. Every mutation is: look up -> check -> write, all synchronous. `withApi`
 * resolves `actor` from the session after its last await, so the actor, the check and the
 * write all see the same store state (two IT deactivating each other at once cannot both
 * pass the last-active check).
 */

export function listVisibleUsers(actor: User): UserRow[] {
  const users = [...getStore().users.values()];
  return users
    .filter((user) => canActOn(actor, 'users.view', user))
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map((user) => toRow(users, actor, user));
}

export function getVisibleUser(actor: User, id: string): UserRow {
  const target = findUser(id);
  if (!canActOn(actor, 'users.view', target)) {
    throw new AppError(ERROR_CODE.FORBIDDEN, 'You can view only your direct reports');
  }
  return toRow([...getStore().users.values()], actor, target);
}

export function listAssignableManagers(): { id: string; fullName: string }[] {
  return [...getStore().users.values()]
    .filter(canHaveReportsNow)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .map(({ id, fullName }) => ({ id, fullName }));
}

export function getMe(actor: User): Me {
  return {
    user: actor,
    managerName: managerNameOf(actor.managerId),
    roleLabel: ROLE_POLICIES[actor.role].label,
  };
}

export function createUser(actor: User, input: CreateUserInput): User {
  const store = getStore();
  enforce(checkCreate(actor));
  enforce(checkEmailAvailable(store.users.values(), input.email));
  enforce(checkManagerAssignable(store.users.values(), input.managerId));

  const user: User = {
    id: newUserId(),
    fullName: input.fullName,
    email: input.email,
    role: input.role,
    status: USER_STATUS.ACTIVE,
    managerId: input.managerId,
    createdAt: new Date().toISOString(),
  };
  store.users.set(user.id, user);
  store.credentials.set(user.id, input.password);
  return user;
}

export function updateProfile(actor: User, id: string, input: UpdateProfileInput): User {
  const store = getStore();
  const target = findUser(id);
  enforce(checkEditProfile(actor, target));
  if (input.email !== undefined) {
    enforce(checkEmailAvailable(store.users.values(), input.email, target.id));
  }
  return save({
    ...target,
    fullName: input.fullName ?? target.fullName,
    email: input.email ?? target.email,
  });
}

export function changeRole(actor: User, id: string, role: Role): User {
  const target = findUser(id);
  enforce(checkChangeRole(getStore().users.values(), actor, target, role));
  return save({ ...target, role });
}

export function changeStatus(actor: User, id: string, status: UserStatus): User {
  const target = findUser(id);
  enforce(checkChangeStatus(getStore().users.values(), actor, target, status));
  const updated = save({ ...target, status });
  if (status === USER_STATUS.DEACTIVATED) revokeUserSessions(target.id);
  return updated;
}

function findUser(id: string): User {
  const user = getStore().users.get(id);
  if (!user) throw new AppError(ERROR_CODE.NOT_FOUND, 'User not found');
  return user;
}

/** Replace, not mutate: rows and actors handed out earlier keep their old values. */
function save(user: User): User {
  getStore().users.set(user.id, user);
  return user;
}

function newUserId(): string {
  const { users } = getStore();
  let id: string;
  do {
    id = `usr_${randomUUID().slice(0, 8)}`;
  } while (users.has(id));
  return id;
}

function managerNameOf(managerId: string | null): string | null {
  if (managerId === null) return null;
  return getStore().users.get(managerId)?.fullName ?? null;
}

/**
 * `allowed` runs the same checks as the mutations, as a dry run. For the role change any
 * other role gives the same answer: none of the checks depends on which role is chosen.
 */
function toRow(users: readonly User[], actor: User, target: User): UserRow {
  const otherRole = ROLES.find((role) => role !== target.role) ?? target.role;
  const otherStatus = target.status === USER_STATUS.ACTIVE ? USER_STATUS.DEACTIVATED : USER_STATUS.ACTIVE;
  return {
    ...target,
    managerName: managerNameOf(target.managerId),
    allowed: {
      editProfile: checkEditProfile(actor, target),
      changeRole: checkChangeRole(users, actor, target, otherRole),
      changeStatus: checkChangeStatus(users, actor, target, otherStatus),
    },
  };
}
