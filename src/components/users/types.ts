import type { Role } from '@/domain/roles';

/** Plain props the /manage-users page passes from the server. */
/** `canHaveManager` comes from ROLE_POLICIES: the create form hides the manager field when it is false. */
export type RoleOption = { value: Role; label: string; canHaveManager: boolean };
export type ManagerOption = { id: string; fullName: string };
