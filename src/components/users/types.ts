import type { Role } from '@/domain/roles';

/** Plain props the /manage-users page passes from the server. */
/** `reportsTo` comes from ROLE_POLICIES: the create form offers only managers with one of these roles. */
export type RoleOption = { value: Role; label: string; reportsTo: readonly Role[] };
export type ManagerOption = { id: string; fullName: string; role: Role };
