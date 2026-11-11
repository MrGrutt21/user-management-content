import type { Role } from '@/domain/roles';

/** Plain props the /manage-users page passes from the server. */
export type RoleOption = { value: Role; label: string };
export type ManagerOption = { id: string; fullName: string };
