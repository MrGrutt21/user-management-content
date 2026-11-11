import 'server-only';

import { ALLOWED, ERROR_CODE, deny, type Decision } from '@/domain/errors';
import { ROLE_POLICIES, type Role } from '@/domain/roles';
import { USER_STATUS, type User, type UserStatus } from '@/domain/types';
import { canActOn, hasCapability } from '@/server/auth/permissions';

/**
 * Checks for user mutations. Pure and synchronous: they return a Decision instead of
 * throwing, so the service enforces them and /manage-users shows the same answer ahead of time.
 *
 * Role and status changes are checked in this order:
 *   1. capability/scope (canActOn)        -> FORBIDDEN
 *   2. the role's last active member      -> LAST_ACTIVE_ROLE_MEMBER
 *   3. yourself                           -> CANNOT_CHANGE_OWN_ROLE / CANNOT_DEACTIVATE_SELF
 * Step 2 comes before step 3 because it protects the whole system whoever is acting:
 * the last active IT deactivating himself is told "no IT would be left", not "it's you".
 */

export function checkCreate(actor: User): Decision {
  return hasCapability(actor, 'users.create')
    ? ALLOWED
    : deny(ERROR_CODE.FORBIDDEN, 'You are not allowed to create users');
}

export function checkEditProfile(actor: User, target: User): Decision {
  return canActOn(actor, 'users.editProfile', target)
    ? ALLOWED
    : deny(ERROR_CODE.FORBIDDEN, 'You can edit only the profiles of your direct reports');
}

export function checkChangeRole(users: Iterable<User>, actor: User, target: User, nextRole: Role): Decision {
  if (!canActOn(actor, 'users.changeRole', target)) {
    return deny(ERROR_CODE.FORBIDDEN, 'You are not allowed to change roles');
  }
  if (nextRole === target.role) return ALLOWED;

  const quorum = checkKeepsRoleCovered(users, target);
  if (!quorum.allowed) return quorum;

  // Roles are not ranked, so any change of your own role counts as a demotion.
  if (actor.id === target.id) {
    return deny(ERROR_CODE.CANNOT_CHANGE_OWN_ROLE, 'You cannot change your own role');
  }
  return ALLOWED;
}

export function checkChangeStatus(users: Iterable<User>, actor: User, target: User, nextStatus: UserStatus): Decision {
  if (!canActOn(actor, 'users.changeStatus', target)) {
    return deny(ERROR_CODE.FORBIDDEN, 'You are not allowed to activate or deactivate users');
  }
  // Activating someone can never break an invariant.
  if (nextStatus === target.status || nextStatus === USER_STATUS.ACTIVE) return ALLOWED;

  const quorum = checkKeepsRoleCovered(users, target);
  if (!quorum.allowed) return quorum;

  if (actor.id === target.id) {
    return deny(ERROR_CODE.CANNOT_DEACTIVATE_SELF, 'You cannot deactivate your own account');
  }
  return ALLOWED;
}

/** Can other users have this one as their manager? Also used for the create form's options. */
export function canHaveReportsNow(user: User): boolean {
  return user.status === USER_STATUS.ACTIVE && ROLE_POLICIES[user.role].canHaveReports;
}

/**
 * Only a role with `canHaveManager` may have a manager, and the manager must be an active
 * user whose role `canHaveReports`. A manager or an IT account therefore never has a `managerId`.
 */
export function checkManagerAssignable(users: Iterable<User>, role: Role, managerId: string | null): Decision {
  if (managerId === null) return ALLOWED;
  const policy = ROLE_POLICIES[role];
  if (!policy.canHaveManager) {
    return deny(ERROR_CODE.INVALID_MANAGER, `A ${policy.label} account cannot have a manager`);
  }
  for (const user of users) {
    if (user.id === managerId && canHaveReportsNow(user)) return ALLOWED;
  }
  return deny(ERROR_CODE.INVALID_MANAGER, 'The manager must be an active user whose role can have direct reports');
}

/** Emails are compared as stored: the schemas trim and lower-case them. */
export function checkEmailAvailable(users: Iterable<User>, email: string, exceptUserId?: string): Decision {
  for (const user of users) {
    if (user.email === email && user.id !== exceptUserId) {
      return deny(ERROR_CODE.EMAIL_TAKEN, 'This email is already used by another account');
    }
  }
  return ALLOWED;
}

/**
 * Rule 4, called only when `target` is about to leave the active members of its role
 * (deactivated, or moved to another role). Driven by the policy flag, never by a role name.
 */
function checkKeepsRoleCovered(users: Iterable<User>, target: User): Decision {
  const policy = ROLE_POLICIES[target.role];
  if (!policy.keepAtLeastOneActive || target.status !== USER_STATUS.ACTIVE) return ALLOWED;
  for (const user of users) {
    if (user.id !== target.id && user.role === target.role && user.status === USER_STATUS.ACTIVE) return ALLOWED;
  }
  return deny(
    ERROR_CODE.LAST_ACTIVE_ROLE_MEMBER,
    `${target.fullName} is the last active ${policy.label} account; the system cannot be left without one`,
  );
}
