import 'server-only';

import { ROLE_POLICIES, type Action, type Scope } from '@/domain/roles';
import type { User } from '@/domain/types';

/**
 * The only function that turns "role + action (+ target)" into yes/no.
 * Rules that do not depend on the role (yourself, last active IT) live in
 * `src/server/users/user-rules.ts`.
 */

function scopeOf(actor: User, action: Action): Scope {
  return ROLE_POLICIES[actor.role].can[action];
}

/** Can the actor do this action to at least some target? (Page access, nav links, capability guards.) */
export function hasCapability(actor: User, action: Action): boolean {
  return scopeOf(actor, action) !== 'none';
}

/** Can the actor do this action to this particular user? */
export function canActOn(actor: User, action: Action, target: User): boolean {
  const scope = scopeOf(actor, action);
  switch (scope) {
    case 'all':
      return true;
    case 'directReports':
      return target.managerId === actor.id && target.id !== actor.id;
    case 'none':
      return false;
    default:
      return assertNever(scope);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled scope: ${String(value)}`);
}
