import { expect, test, type Page } from '@playwright/test';

import { acceptConfirms, apiAs, collectAlerts, credentials, resetDemo, rowWith, signIn } from './support';

/**
 * The six scenarios of the task and the forms, clicked through in a real browser against the
 * production server. Each test starts from the seed.
 */

test.beforeEach(async () => {
  await resetDemo();
});

const clientRows = (page: Page) => page.locator('table tbody tr');

test.describe('Scenario 1-2: Anna, a manager', () => {
  test('sees only her four reports, can only edit them, and cannot touch roles or statuses', async ({ page }) => {
    await signIn(page, 'anna');
    await expect(page).toHaveURL(/\/content$/);
    await page.getByRole('link', { name: 'Manage users' }).click();

    await expect(page.getByRole('heading', { name: 'Your direct reports' })).toBeVisible();
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(4);
    for (const name of ['Olena Kravchenko', 'Taras Boyko', 'Sofia Rudenko', 'Andriy Polishchuk']) {
      await expect(rowWith(page, name)).toHaveCount(1);
    }
    await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(4);
    await expect(page.getByRole('button', { name: /Deactivate|Activate|Change/ })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Role' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Create user' })).toHaveCount(0);
    // Not herself, not Dmytro (Bohdan's), not Kateryna (no manager). Matched by email: "Anna
    // Shevchenko" does appear, in the Manager column of her reports.
    for (const email of ['anna@example.com', 'dmytro@example.com', 'kateryna@example.com']) {
      await expect(rowWith(page, email)).toHaveCount(0);
    }
  });

  test('edits Olena’s name and email, and sees a clear error for a taken email', async ({ page }) => {
    await signIn(page, 'anna');
    await page.goto('/manage-users');
    const olena = rowWith(page, 'olena@example.com');
    await olena.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel('Full name').fill('Olena K.');
    await page.getByLabel('Email').fill('ivan@example.com');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('This email is already used by another account')).toBeVisible();

    await page.getByLabel('Email').fill('olena.k@example.com');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(rowWith(page, 'olena.k@example.com')).toContainText('Olena K.');
  });
});

test.describe('a stale tab cannot do what the server no longer allows', () => {
  test('Anna saves Olena after IT promoted her: the refusal shows in the row', async ({ page }) => {
    await signIn(page, 'anna');
    await page.goto('/manage-users');
    const olena = rowWith(page, 'olena@example.com');
    await olena.getByRole('button', { name: 'Edit' }).click();

    const ivan = await apiAs('ivan');
    expect((await ivan.patch('/api/users/usr_olena/role', { data: { role: 'manager' } })).status()).toBe(200);
    await ivan.dispose();

    await page.getByLabel('Full name').fill('Olena (stale tab)');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('You can edit only the profiles of your direct reports')).toBeVisible();
  });
});

test.describe('one browser, several tabs: they share one sign-in', () => {
  const topBar = (page: Page) => page.locator('header.topbar');

  test('a second tab opens the account already signed in; its /login goes home', async ({ page }) => {
    await signIn(page, 'ivan');
    const second = await page.context().newPage();
    await second.goto('/login');
    await expect(second).toHaveURL(/\/manage-users$/);
    await expect(topBar(second)).toContainText('Ivan Petrenko');
  });

  test('log out and in as someone else in one tab: the other tab follows at once', async ({ page }) => {
    await signIn(page, 'ivan');
    const second = await page.context().newPage();
    await second.goto('/manage-users');

    await second.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
    // Let the reloaded tab start listening before the next sign-in is announced.
    await page.waitForLoadState('networkidle');

    await signIn(second, 'iryna');
    await expect(page).toHaveURL(/\/manage-users$/);
    await expect(topBar(page)).toContainText('Iryna Kovalenko');
  });

  test('a tab that missed the switch cannot act as the new account: 409, nothing written, it reloads', async ({ page }) => {
    acceptConfirms(page);
    await signIn(page, 'ivan');
    await expect(topBar(page)).toContainText('Ivan Petrenko');

    // Switch the browser to Iryna behind the tab's back: same cookie jar, no message to the tab.
    const browserRequests = page.context().request;
    expect((await browserRequests.post('/api/auth/logout')).status()).toBe(200);
    expect((await browserRequests.post('/api/auth/login', { data: credentials('iryna') })).status()).toBe(200);

    const answer = page.waitForResponse((res) => res.url().endsWith('/api/users/usr_taras/status'));
    await rowWith(page, 'taras@example.com').getByRole('button', { name: 'Deactivate' }).click();
    expect((await answer).status()).toBe(409);

    await expect(topBar(page)).toContainText('Iryna Kovalenko');
    await expect(rowWith(page, 'taras@example.com').getByRole('button', { name: 'Deactivate' })).toBeVisible();
  });

  test('a login form left open: a second account is refused and the signed-in one offered', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    // Signed in from elsewhere in this browser, without telling this tab.
    expect((await page.context().request.post('/api/auth/login', { data: credentials('ivan') })).status()).toBe(200);

    const { email, password } = credentials('iryna');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('You are already signed in as Ivan Petrenko')).toBeVisible();

    await page.getByRole('link', { name: 'Continue as the signed-in account' }).click();
    await expect(page).toHaveURL(/\/manage-users$/);
    await expect(topBar(page)).toContainText('Ivan Petrenko');
  });
});

test.describe('Scenario 3: paging through clients', () => {
  test('each page is one request of 25 clients; the detail page opens', async ({ page }) => {
    const clientCalls: string[] = [];
    page.on('request', (req) => {
      if (new URL(req.url()).pathname === '/api/clients') clientCalls.push(req.url());
    });
    await signIn(page, 'anna');
    await expect(clientRows(page)).toHaveCount(25);
    await expect(page.getByText('Page 1 of 48 · 1,200 clients')).toBeVisible();
    expect(clientCalls).toHaveLength(1);

    const [res] = await Promise.all([
      page.waitForResponse((r) => new URL(r.url()).pathname === '/api/clients'),
      page.getByRole('button', { name: 'Next' }).click(),
    ]);
    const body: unknown = await res.json();
    expect(body).toMatchObject({ page: 2, total: 1200 });
    await expect(page).toHaveURL(/page=2/);
    await expect(page.getByText('Page 2 of 48')).toBeVisible();
    expect(clientCalls).toHaveLength(2);

    const first = clientRows(page).first().getByRole('link');
    const name = await first.innerText();
    await first.click();
    await expect(page).toHaveURL(/\/content\/client\/cl_\d{4}$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await page.goBack();
    await expect(page.getByText('Page 2 of 48')).toBeVisible();
  });

  test('sort, filter and search live in the URL and survive a reload', async ({ page }) => {
    await signIn(page, 'anna');
    await page.getByRole('button', { name: /^Name/ }).click();
    await expect(page).toHaveURL(/sort=name&order=asc|order=asc.*sort=name|sort=name.*order=asc/);
    await page.getByLabel('Status').selectOption('churned');
    await expect(page).toHaveURL(/status=churned/);
    await expect(page.locator('tbody .badge').filter({ hasNotText: /churned/i })).toHaveCount(0);

    await page.getByLabel('Search clients').fill('zzzz-no-such-client');
    await expect(page).toHaveURL(/q=zzzz-no-such-client/);
    await expect(page.getByText('No clients match')).toBeVisible();

    await page.reload();
    await expect(page.getByLabel('Search clients')).toHaveValue('zzzz-no-such-client');
    await expect(page.getByLabel('Status')).toHaveValue('churned');
  });

  test('a hand-typed page past the end says so and Prev goes to the last real page', async ({ page }) => {
    await signIn(page, 'anna');
    await page.goto('/content?page=999');
    await expect(page.getByText('No clients on this page')).toBeVisible();
    await page.getByRole('button', { name: 'Prev' }).click();
    await expect(page.getByText('Page 48 of 48')).toBeVisible();
    await expect(clientRows(page)).toHaveCount(25);
  });

  test('an unknown client id shows the 404 page', async ({ page }) => {
    await signIn(page, 'anna');
    const res = await page.goto('/content/client/cl_9999');
    expect(res?.status()).toBe(404);
  });
});

test.describe('Scenario 4: Ivan, IT', () => {
  test('lands on /manage-users; /content is a 403 page inside the app, not a redirect loop', async ({ page }) => {
    await signIn(page, 'ivan');
    await expect(page).toHaveURL(/\/manage-users$/);
    await expect(page.getByRole('link', { name: 'Clients' })).toHaveCount(0);

    const res = await page.goto('/content');
    expect(res?.status()).toBe(403);
    await expect(page.getByRole('heading', { name: '403 — Forbidden' })).toBeVisible();
    await expect(page.getByText('Ivan Petrenko')).toBeVisible();
    await page.getByRole('link', { name: 'Go to your home page' }).click();
    await expect(page).toHaveURL(/\/manage-users$/);
  });
});

test.describe('Scenario 5: Ivan and the last active IT', () => {
  test('a different reason each time, shown next to the disabled control', async ({ page }) => {
    acceptConfirms(page);
    await signIn(page, 'ivan');
    const ivanRow = rowWith(page, 'ivan@example.com');
    await expect(ivanRow.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
    await expect(ivanRow).toContainText('You cannot deactivate your own account');
    await expect(ivanRow.getByRole('combobox', { name: 'Role' })).toBeDisabled();
    await expect(ivanRow).toContainText('You cannot change your own role');

    await rowWith(page, 'iryna@example.com').getByRole('button', { name: 'Deactivate' }).click();
    await expect(rowWith(page, 'iryna@example.com').getByRole('button', { name: 'Activate' })).toBeVisible();

    await expect(ivanRow).toContainText('Ivan Petrenko is the last active IT account');
    await expect(ivanRow.getByRole('button', { name: 'Deactivate' })).toBeDisabled();
  });
});

test.describe('Scenario 6: Olena is deactivated while browsing', () => {
  test('her next pager click lands on /login with a reason, and she cannot sign in again', async ({ browser }) => {
    const olenaContext = await browser.newContext();
    const ivanContext = await browser.newContext();
    const olena = await olenaContext.newPage();
    const ivan = await ivanContext.newPage();
    acceptConfirms(ivan);

    await signIn(olena, 'olena');
    await expect(clientRows(olena)).toHaveCount(25);

    await signIn(ivan, 'ivan');
    await rowWith(ivan, 'olena@example.com').getByRole('button', { name: 'Deactivate' }).click();
    await expect(rowWith(ivan, 'olena@example.com').getByRole('button', { name: 'Activate' })).toBeVisible();

    await olena.getByRole('button', { name: 'Next' }).click();
    await expect(olena).toHaveURL(/\/login\?reason=session_ended/);
    await expect(olena.getByText('Your session has ended')).toBeVisible();
    await expect(olena.getByRole('button', { name: 'Log out' })).toHaveCount(0);

    const { email, password } = credentials('olena');
    await olena.getByLabel('Email').fill(email);
    await olena.getByLabel('Password').fill(password);
    await olena.getByRole('button', { name: 'Sign in' }).click();
    await expect(olena.getByText('This account is deactivated')).toBeVisible();

    await Promise.all([olenaContext.close(), ivanContext.close()]);
  });

  test('a link click after deactivation is redirected by the server, without the old top bar', async ({ browser }) => {
    const tarasContext = await browser.newContext();
    const taras = await tarasContext.newPage();
    await signIn(taras, 'taras');
    await expect(clientRows(taras)).toHaveCount(25);

    const ivanContext = await browser.newContext();
    const ivan = await ivanContext.newPage();
    acceptConfirms(ivan);
    await signIn(ivan, 'ivan');
    await rowWith(ivan, 'taras@example.com').getByRole('button', { name: 'Deactivate' }).click();
    await expect(rowWith(ivan, 'taras@example.com').getByRole('button', { name: 'Activate' })).toBeVisible();

    await taras.getByRole('link', { name: 'My profile' }).click();
    await expect(taras).toHaveURL(/\/login\?reason=session_ended/);
    await expect(taras.getByRole('button', { name: 'Log out' })).toHaveCount(0);

    await Promise.all([tarasContext.close(), ivanContext.close()]);
  });
});

test.describe('creating users (IT)', () => {
  test('the manager field follows the role: hidden for IT and manager, only managers offered for a user', async ({ page }) => {
    await signIn(page, 'ivan');
    const form = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Create user' }) });
    // A <select> wrapped in its <label> is named "Role <selected option>", hence the prefix match.
    const role = form.getByRole('combobox', { name: /^Role/ });
    const manager = form.getByRole('combobox', { name: /^Manager/ });

    await role.selectOption({ label: 'Manager' });
    await expect(manager).toHaveCount(0);
    await role.selectOption({ label: 'IT' });
    await expect(manager).toHaveCount(0);
    await role.selectOption({ label: 'User' });
    await expect(manager.locator('option')).toHaveText(['No manager', 'Anna Shevchenko', 'Bohdan Melnyk', 'Marta Bondar']);
  });

  test('a new user with a script-like name appears in the list as plain text and can sign in', async ({ page, browser }) => {
    const alerts = collectAlerts(page);
    await signIn(page, 'ivan');
    const form = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Create user' }) });
    const name = '<img src=x onerror=alert(1)> Petro';
    await form.getByLabel('Full name').fill(name);
    await form.getByLabel('Email').fill('petro@example.com');
    await form.getByRole('combobox', { name: /^Role/ }).selectOption({ label: 'User' });
    await form.getByRole('combobox', { name: /^Manager/ }).selectOption({ label: 'Marta Bondar' });
    await form.getByLabel('Password').fill('petro123');
    await form.getByRole('button', { name: 'Create user' }).click();

    await expect(form.getByText(`Created ${name}`)).toBeVisible();
    await expect(rowWith(page, 'petro@example.com')).toContainText(name);
    await expect(rowWith(page, 'petro@example.com')).toContainText('Marta Bondar');
    expect(alerts).toEqual([]);

    const petroContext = await browser.newContext();
    const petro = await petroContext.newPage();
    await petro.goto('/login');
    await petro.getByLabel('Email').fill('PETRO@example.com');
    await petro.getByLabel('Password').fill('petro123');
    await petro.getByRole('button', { name: 'Sign in' }).click();
    await expect(petro).toHaveURL(/\/content$/);
    await petroContext.close();
  });

  test('field errors from the server are shown next to the fields', async ({ page }) => {
    await signIn(page, 'ivan');
    const form = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Create user' }) });
    await form.getByLabel('Full name').fill('Short Password');
    await form.getByLabel('Email').fill('anna@example.com');
    await form.getByRole('combobox', { name: /^Role/ }).selectOption({ label: 'User' });
    await form.getByLabel('Password').fill('12345');
    await form.getByRole('button', { name: 'Create user' }).click();
    await expect(form.getByText('At least 6 characters')).toBeVisible();

    await form.getByLabel('Password').fill('123456');
    await form.getByRole('button', { name: 'Create user' }).click();
    await expect(form.getByText('This email is already used by another account')).toBeVisible();
  });

  test('promoting Olena to manager drops her from Anna’s reports', async ({ page }) => {
    await signIn(page, 'ivan');
    const olena = rowWith(page, 'olena@example.com');
    await olena.getByRole('combobox', { name: 'Role' }).selectOption({ label: 'Manager' });
    await olena.getByRole('button', { name: 'Change' }).click();
    await expect(olena.locator('td').nth(3)).toHaveText('—');

    await page.getByRole('button', { name: 'Log out' }).click();
    await signIn(page, 'anna');
    await page.goto('/manage-users');
    await expect(page.locator('tbody tr')).toHaveCount(3);
  });
});

test.describe('signing out and the demo reset', () => {
  test('log out goes to /login with a message; the old pages redirect', async ({ page }) => {
    await signIn(page, 'anna');
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login\?reason=logged_out/);
    await expect(page.getByText('You have been signed out.')).toBeVisible();
    await page.goto('/content');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Back after logging out does not show the signed-in page again', async ({ page }) => {
    await signIn(page, 'anna');
    await expect(clientRows(page)).toHaveCount(25);
    await page.getByRole('button', { name: 'Log out' }).click();
    await expect(page).toHaveURL(/\/login\?reason=logged_out/);
    await page.goBack();
    // The server redirects again; no top bar of the old session (the demo table on /login lists Anna anyway).
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole('button', { name: 'Log out' })).toHaveCount(0);
  });

  test('a wrong password shows an error and keeps the user on /login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('anna@example.com');
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('a demo account row fills the form', async ({ page }) => {
    await page.goto('/login');
    await rowWith(page, 'bohdan@example.com').click();
    await expect(page.getByLabel('Email')).toHaveValue('bohdan@example.com');
    await expect(page.getByLabel('Password')).toHaveValue('bohdan123');
  });

  test('reset puts the seed back and signs everyone out', async ({ page }) => {
    acceptConfirms(page);
    await signIn(page, 'ivan');
    await rowWith(page, 'iryna@example.com').getByRole('button', { name: 'Deactivate' }).click();
    await expect(rowWith(page, 'iryna@example.com').getByRole('button', { name: 'Activate' })).toBeVisible();

    await page.getByRole('button', { name: /reset demo data/i }).click();
    await expect(page).toHaveURL(/\/login\?reason=demo_reset/);
    await signIn(page, 'iryna');
    await expect(page).toHaveURL(/\/manage-users$/);
  });
});
