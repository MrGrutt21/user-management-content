import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a RUNNING production server, normally the Docker container:
 *
 *   docker compose up --build -d
 *   npm run test:e2e                                  # BASE_URL defaults to http://localhost:3000
 *   BASE_URL=http://localhost:3200 npm run test:e2e   # another port
 *
 * The server must run with DEMO_RESET=true: each test starts by resetting the demo data.
 * One worker, in order: every test shares the server's single in-memory store.
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
