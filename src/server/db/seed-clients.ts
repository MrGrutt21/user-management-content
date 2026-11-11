import 'server-only';

import { CLIENT_STATUS, type Client } from '@/domain/types';

export const CLIENT_SEED = {
  count: 1200,
  /** Fixed seed: the same clients (and ids) after every restart. */
  randomSeed: 42,
  churnRate: 0.3,
} as const;

const FIRST_NAMES = [
  'Alex', 'Maria', 'John', 'Elena', 'David', 'Sofia', 'Michael', 'Anna', 'Daniel', 'Laura',
  'Chris', 'Nina', 'George', 'Eva', 'Peter', 'Clara', 'Lucas', 'Mia', 'Andreas', 'Ioanna',
  'Marco', 'Julia', 'Tom', 'Sara', 'Nikos', 'Emma', 'Paul', 'Lena', 'Omar', 'Hanna',
] as const;

const LAST_NAMES = [
  'Smith', 'Papadopoulos', 'Müller', 'Rossi', 'Novak', 'Garcia', 'Kowalski', 'Jensen', 'Dubois', 'Silva',
  'Georgiou', 'Schmidt', 'Moreau', 'Costa', 'Nielsen', 'Horvat', 'Weber', 'Ivanova', 'Lambert', 'Fischer',
] as const;

const COMPANY_PREFIXES = [
  'Blue', 'Golden', 'Nova', 'Bright', 'Silver', 'Royal', 'Lucky', 'Prime', 'Star', 'Atlas',
  'Apex', 'Vertex', 'Coral', 'Delta', 'Echo', 'Fortune', 'Harbor', 'Iron', 'Jade', 'Summit',
] as const;

const COMPANY_SUFFIXES = [
  'Gaming', 'Bet', 'Play', 'Casino', 'Media', 'Labs', 'Group', 'Digital', 'Ventures', 'Studios',
] as const;

const COUNTRIES = [
  'Cyprus', 'Greece', 'Malta', 'Germany', 'Spain', 'Italy', 'Portugal', 'Poland', 'Ukraine', 'Romania',
  'Bulgaria', 'Netherlands', 'Sweden', 'Denmark', 'Estonia', 'Brazil', 'Mexico', 'Canada', 'United Kingdom', 'Ireland',
] as const;

const RANGE_START = Date.UTC(2023, 0, 1);
const RANGE_END = Date.UTC(2026, 9, 31);

/** mulberry32: a tiny deterministic PRNG, so the data set is stable without a dependency. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly [T, ...T[]]): T {
  const index = Math.floor(random() * items.length);
  return items[index] ?? items[0];
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function generateClients(count: number = CLIENT_SEED.count, seed: number = CLIENT_SEED.randomSeed): Client[] {
  const random = createRandom(seed);
  const clients: Client[] = [];
  for (let i = 1; i <= count; i += 1) {
    const first = pick(random, FIRST_NAMES);
    const last = pick(random, LAST_NAMES);
    const company = `${pick(random, COMPANY_PREFIXES)} ${pick(random, COMPANY_SUFFIXES)}`;
    const createdAt = RANGE_START + Math.floor(random() * (RANGE_END - RANGE_START));
    clients.push({
      id: `cl_${String(i).padStart(4, '0')}`,
      name: `${first} ${last}`,
      company,
      email: `${slug(first)}.${slug(last)}${i}@${slug(company)}.example`,
      country: pick(random, COUNTRIES),
      status: random() < CLIENT_SEED.churnRate ? CLIENT_STATUS.CHURNED : CLIENT_STATUS.ACTIVE,
      createdAt: new Date(createdAt).toISOString(),
    });
  }
  return clients;
}
