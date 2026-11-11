import { expect, request, type APIRequestContext, type Page } from '@playwright/test';

/** Seeded accounts log in as `<name>@example.com` / `<name>123` (README, "Seeded accounts"). */
export type SeedName =
  | 'ivan'
  | 'iryna'
  | 'anna'
  | 'bohdan'
  | 'marta'
  | 'serhii'
  | 'olena'
  | 'taras'
  | 'sofia'
  | 'andriy'
  | 'dmytro'
  | 'maksym'
  | 'yulia'
  | 'kateryna';

export function credentials(name: SeedName): { email: string; password: string } {
  return { email: `${name}@example.com`, password: `${name}123` };
}

export function baseURL(): string {
  return process.env.BASE_URL ?? 'http://localhost:3000';
}

/** Back to the seed; everyone is signed out. Fails clearly if the server runs without DEMO_RESET=true. */
export async function resetDemo(): Promise<void> {
  const api = await request.newContext({ baseURL: baseURL() });
  const res = await api.post('/api/demo/reset');
  expect(res.status(), 'run the server with DEMO_RESET=true').toBe(200);
  await api.dispose();
}

/** An HTTP client with its own cookie jar, signed in as `name` (or anonymous). Dispose it after use. */
export async function apiAs(name: SeedName | null): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: baseURL() });
  if (name) {
    const res = await api.post('/api/auth/login', { data: credentials(name) });
    expect(res.status(), `login as ${name}`).toBe(200);
  }
  return api;
}

/** Sign in through the login form, the way a person does. */
export async function signIn(page: Page, name: SeedName): Promise<void> {
  const { email, password } = credentials(name);
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** The row of /manage-users (or any table) that mentions `text`, e.g. an email. */
export function rowWith(page: Page, text: string) {
  return page.getByRole('row').filter({ hasText: text });
}

/** Collects every alert the page opens (e.g. a name rendered as HTML that ran a script). Expect it to stay empty. */
export function collectAlerts(page: Page): string[] {
  const alerts: string[] = [];
  page.on('dialog', (dialog) => {
    if (dialog.type() !== 'alert') return;
    alerts.push(dialog.message());
    void dialog.dismiss();
  });
  return alerts;
}

/** Accept the "Deactivate …?" confirm dialog for the rest of the test. */
export function acceptConfirms(page: Page): void {
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'confirm') void dialog.accept();
  });
}
