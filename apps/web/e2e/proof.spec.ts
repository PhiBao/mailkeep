import { expect, test } from '@playwright/test';

const proof = {
  capturedAt: '2026-11-25T04:30:00.000Z',
  where: {
    spriteName: 'mailkeep',
    url: 'https://mailkeep-hl3m.sprites.app',
    serviceStatus: 'running',
    gitSha: '9d8a64617f3ea7a2cfd880c3623715f258390697',
    uptime: '2h 14m',
  },
  connectors: [
    { provider: 'typesafe', connectionIdPrefix: 'nzOp5iVC', credentialLocation: 'Fly connector' },
    { provider: 'ollama', connectionIdPrefix: 'Xuv-D-ig', credentialLocation: 'Fly connector' },
    { provider: 'pinecone', connectionIdPrefix: 'anVdybVe', credentialLocation: 'Fly connector' },
    { provider: 'box', connectionIdPrefix: 'D6Q3d2I6', credentialLocation: 'Fly connector' },
    { provider: 'agentmail', connectionIdPrefix: 'oFVcFZMw', credentialLocation: 'Fly connector' },
  ],
  keyscan: {
    found: 0,
    checkedAt: '2026-11-24T21:35:32.000Z',
    envVarNames: ['MAILKEEP_PUBLIC_URL', 'MAILKEEP_DATA_DIR', 'PORT'],
  },
  thresholds: [
    { key: 'linkAccept', bar: 0.85, effect: 'link to the past letter’s case' },
    { key: 'scamAny', bar: 0.5, effect: 'careful; never sets an amount owed' },
  ],
  eval: {
    runId: 'heldout-20261125042539630',
    generatedAt: '2026-11-25T04:26:39.619Z',
    heldout: true,
    letters: 6,
    laneAccuracy: 0.8333333333333334,
    neverSafe: '6/6',
    falseAlarms: 0,
    scamsCaught: '1/2',
    linkPrecision: 1,
    linkRecall: 1,
    amountAccuracy: 0,
    dueAccuracy: 1,
    askRate: 0.3333333333333333,
    averageLatencyMs: 726,
  },
  costs: {
    lettersProcessed: 32,
    totalMicrousd: 14112,
    averageMicrousd: 441,
    jevMicrousd: 5300,
    ollamaMicrousd: 8812,
  },
  priorArt: {
    name: 'pyaroslav/kitchen-table',
    url: 'https://github.com/pyaroslav/kitchen-table',
    difference: 'Mailkeep adds calibrated cross-letter linking and family-only escalation.',
  },
};

for (const width of [390, 1440]) {
  test(`Proof renders all seven sections at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.route('**/api/proof', (route) => route.fulfill({ json: proof }));
    await page.goto('/proof');
    await expect(page.getByRole('heading', { name: 'How Mailkeep runs' })).toBeVisible();
    for (const name of [
      '1. Where it runs',
      '2. What it can reach',
      '3. What it holds',
      '4. How it decides',
      '5. How well',
      '6. What it costs',
      '7. Prior art',
    ]) {
      await expect(page.getByRole('heading', { name })).toBeVisible();
    }
    await expect(page.getByText('Provider keys found on this Sprite: 0')).toBeVisible();
    await expect(page.getByText('83.3%')).toBeVisible();
    await expect(page.getByText('held-out', { exact: false })).toBeVisible();
    await expect(page.getByText('1/2')).toBeVisible();
    await expect(page.getByText('nzOp5iVC…')).toBeVisible();
    const text = await page.locator('body').textContent();
    expect(text).not.toContain('nzOp5iVCbA5OBl_eRQvEwQ');
    expect(text).not.toContain('MAILKEEP_PUBLIC_URL=https');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `docs/screens/proof-${width}.png`, fullPage: true });
  });
}
