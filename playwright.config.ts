import { devices, defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  /* Run tests in a single worker to simplify server access in Windows environments */
  workers: 1,
  use: {
    baseURL: 'http://localhost:3002',
    browserName: 'chromium',
    // Allow running Playwright tests in CI without a display server
    headless: true,
  },
  timeout: 60000,
  retries: 1,
  projects: [
    { 
      name: 'CI: Critical', 
      testMatch: /tests\/critical\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] } 
    },
    { 
      name: 'CI: Integration', 
      testMatch: /tests\/integration\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] } 
    },
    { 
      name: 'CI: Quality', 
      testMatch: /tests\/quality\/.*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] } 
    },
  ],
  webServer: {
    command: 'npm run server',
    port: 3002,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
