import type { Decision } from './errors';
import type { Role } from './roles';

export const USER_STATUS = {
  ACTIVE: 'active',
  DEACTIVATED: 'deactivated',
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

/** Someone who logs into this system. The password is NOT here: it lives in `store.credentials`. */
export type User = {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: UserStatus;
  /** The user who manages this person. A manager may edit only their direct reports. */
  managerId: string | null;
  /** ISO 8601 */
  createdAt: string;
};

export const CLIENT_STATUS = {
  ACTIVE: 'active',
  CHURNED: 'churned',
} as const;

export type ClientStatus = (typeof CLIENT_STATUS)[keyof typeof CLIENT_STATUS];

/** An end client (business data). Clients never log in and are not Users. */
export type Client = {
  id: string;
  name: string;
  company: string;
  email: string;
  country: string;
  status: ClientStatus;
  /** ISO 8601 */
  createdAt: string;
};

/** One page of a server-paginated list. The browser never receives more than this. */
export type Page<T> = {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

/** A seeded login shown on /login. Sent to the browser only in demo mode (DEMO_RESET=true). */
export type DemoAccount = {
  fullName: string;
  email: string;
  password: string;
  roleLabel: string;
  status: UserStatus;
};

/** The current user as the UI sees it. */
export type Me = {
  user: User;
  managerName: string | null;
  roleLabel: string;
};

/**
 * A row of /manage-users. `allowed` is computed on the server by the same checks
 * the mutations run, so the UI never re-implements a rule. The API re-checks anyway.
 */
export type UserRow = User & {
  managerName: string | null;
  allowed: {
    editProfile: Decision;
    changeRole: Decision;
    changeStatus: Decision;
  };
};
