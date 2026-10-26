import { defineConfig } from '@playwright/test'

// End-to-end tests drive the real site against a local Postgres through
// scripts/local-api.ts. See "Running the tests" in the README.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure' },
  webServer: [
    { command: 'npm run api', port: 54321, reuseExistingServer: true },
    { command: 'npm run dev -- --port 5173 --host 127.0.0.1', port: 5173, reuseExistingServer: true },
  ],
})
