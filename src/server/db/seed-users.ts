import 'server-only';

import { ROLE, type Role } from '@/domain/roles';
import { USER_STATUS, type User, type UserStatus } from '@/domain/types';

type SeedUser = {
  id: string;
  fullName: string;
  role: Role;
  status: UserStatus;
  managerId: string | null;
  password: string;
};

/**
 * Pre-created accounts (there is no signup). Ids are fixed so the README's curl
 * examples keep working after a restart. Passwords are plain text on purpose:
 * the task explicitly does not want hashing.
 */
const SEED_USERS: readonly SeedUser[] = [
  // Two IT accounts, so "deactivate the last active IT" can be tested.
  { id: 'usr_ivan', fullName: 'Ivan Petrenko', role: ROLE.IT, status: USER_STATUS.ACTIVE, managerId: null, password: 'ivan123' },
  { id: 'usr_iryna', fullName: 'Iryna Kovalenko', role: ROLE.IT, status: USER_STATUS.ACTIVE, managerId: null, password: 'iryna123' },

  // Managers: Anna has four reports, Bohdan manages Dmytro, Marta has none, Serhii is deactivated.
  { id: 'usr_anna', fullName: 'Anna Shevchenko', role: ROLE.MANAGER, status: USER_STATUS.ACTIVE, managerId: null, password: 'anna123' },
  { id: 'usr_bohdan', fullName: 'Bohdan Melnyk', role: ROLE.MANAGER, status: USER_STATUS.ACTIVE, managerId: null, password: 'bohdan123' },
  { id: 'usr_marta', fullName: 'Marta Bondar', role: ROLE.MANAGER, status: USER_STATUS.ACTIVE, managerId: null, password: 'marta123' },
  { id: 'usr_serhii', fullName: 'Serhii Tkachenko', role: ROLE.MANAGER, status: USER_STATUS.DEACTIVATED, managerId: null, password: 'serhii123' },

  // Anna's four direct reports.
  { id: 'usr_olena', fullName: 'Olena Kravchenko', role: ROLE.USER, status: USER_STATUS.ACTIVE, managerId: 'usr_anna', password: 'olena123' },
  { id: 'usr_taras', fullName: 'Taras Boyko', role: ROLE.USER, status: USER_STATUS.ACTIVE, managerId: 'usr_anna', password: 'taras123' },
  { id: 'usr_sofia', fullName: 'Sofia Rudenko', role: ROLE.USER, status: USER_STATUS.ACTIVE, managerId: 'usr_anna', password: 'sofia123' },
  { id: 'usr_andriy', fullName: 'Andriy Polishchuk', role: ROLE.USER, status: USER_STATUS.ACTIVE, managerId: 'usr_anna', password: 'andriy123' },

  // Bohdan's reports: Dmytro (Anna cannot edit him) and an already deactivated user.
  { id: 'usr_dmytro', fullName: 'Dmytro Lysenko', role: ROLE.USER, status: USER_STATUS.ACTIVE, managerId: 'usr_bohdan', password: 'dmytro123' },
  { id: 'usr_maksym', fullName: 'Maksym Hnatiuk', role: ROLE.USER, status: USER_STATUS.DEACTIVATED, managerId: 'usr_bohdan', password: 'maksym123' },

  // A user whose manager is deactivated, and a user with no manager at all.
  { id: 'usr_yulia', fullName: 'Yulia Moroz', role: ROLE.USER, status: USER_STATUS.ACTIVE, managerId: 'usr_serhii', password: 'yulia123' },
  { id: 'usr_kateryna', fullName: 'Kateryna Savchuk', role: ROLE.USER, status: USER_STATUS.ACTIVE, managerId: null, password: 'kateryna123' },
];

const SEED_CREATED_AT = Date.UTC(2026, 0, 5);
const DAY_MS = 24 * 60 * 60 * 1000;

function emailFor(fullName: string): string {
  const first = fullName.split(' ')[0] ?? fullName;
  return `${first.toLowerCase()}@example.com`;
}

export function seedUsers(): { users: User[]; credentials: Map<string, string> } {
  const credentials = new Map<string, string>();
  const users = SEED_USERS.map((seed, index): User => {
    credentials.set(seed.id, seed.password);
    return {
      id: seed.id,
      fullName: seed.fullName,
      email: emailFor(seed.fullName),
      role: seed.role,
      status: seed.status,
      managerId: seed.managerId,
      createdAt: new Date(SEED_CREATED_AT + index * DAY_MS).toISOString(),
    };
  });
  return { users, credentials };
}
