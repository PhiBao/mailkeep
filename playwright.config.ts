import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

function cachedChromium(): string | undefined {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override) return override;
  const cache = path.join(homedir(), '.cache', 'ms-playwright');
  try {
    const revisions = readdirSync(cache)
      .filter((entry) => /^chromium_headless_shell-\d+$/.test(entry))
      .sort((left, right) => Number(right.split('-').at(-1)) - Number(left.split('-').at(-1)));
    for (const revision of revisions) {
      const executable = path.join(
        cache,
        revision,
        'chrome-headless-shell-linux64',
        'chrome-headless-shell',
      );
      if (existsSync(executable)) return executable;
    }
    const fullRevisions = readdirSync(cache)
      .filter((entry) => /^chromium-\d+$/.test(entry))
      .sort((left, right) => Number(right.split('-').at(-1)) - Number(left.split('-').at(-1)));
    for (const revision of fullRevisions) {
      const executable = path.join(cache, revision, 'chrome-linux64', 'chrome');
      if (existsSync(executable)) return executable;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 2,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    launchOptions: { executablePath: cachedChromium() },
  },
  webServer: {
    command: 'pnpm --filter web exec vite --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
