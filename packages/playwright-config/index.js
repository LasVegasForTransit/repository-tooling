import { devices } from '@playwright/test';

/**
 * The shared Playwright configuration for every LVBT repository. End-to-end
 * tests live under `tests/e2e/` and end in `.spec.ts`; every suite runs on one
 * desktop and one mobile profile; a failing test keeps its trace.
 *
 * Spread it into a package's playwright.config.ts and add the web server:
 *
 *   import { defineConfig } from '@playwright/test';
 *   import { sharedConfig } from '@lvbt/playwright-config';
 *   export default defineConfig({
 *     ...sharedConfig,
 *     webServer: { command: 'pnpm preview', url: 'http://127.0.0.1:4321' },
 *     use: { ...sharedConfig.use, baseURL: 'http://127.0.0.1:4321' },
 *   });
 *
 * @type {import("@playwright/test").PlaywrightTestConfig}
 */
export const sharedConfig = {
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
};
