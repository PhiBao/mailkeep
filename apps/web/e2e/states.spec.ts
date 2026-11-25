import { expect, type Page, test } from '@playwright/test';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#202020"/></svg>')}`;
const emptyToday = {
  household: {
    id: 'hh_test',
    name: "Ruth's mail",
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    isDemo: false,
    today: '2026-12-09',
  },
  asks: [],
  upcoming: [],
  handledThisWeek: { count: 0, items: [] },
  recent: [],
};
const baseLetter = {
  id: 'ltr_state',
  householdId: 'hh_test',
  source: 'upload',
  trial: false,
  submittedBy: null,
  receivedAt: '2026-12-09T12:00:00.000Z',
  status: 'done',
  mime: 'image/jpeg',
  title: 'November Water Bill',
  senderOrg: 'Riverbend Water Utility',
  summaryParent: 'The water bill is due.',
  todoParent: 'Pay the water bill.',
  kind: 'bill',
  lane: 'headsup',
  amountCents: 8417,
  dueDate: '2026-12-10',
  accountTail: '4471',
  phones: [],
  scamRuleHits: [],
  transcript: 'Water bill due December 10.',
  caseId: null,
  error: null,
  imageUrl: image,
  checks: [],
  relations: [],
  recall: [],
  outbox: [],
  decision: null,
};

async function mockToday(page: Page, options: { status?: number; delay?: number } = {}) {
  await page.route('**/api/today', async (route) => {
    if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay));
    await route.fulfill({
      status: options.status ?? 200,
      json: options.status ? { error: 'failed' } : emptyToday,
    });
  });
}

async function mockLetter(page: Page, letter: Record<string, unknown>) {
  await page.route('**/api/letters/ltr_state', (route) => route.fulfill({ json: letter }));
  await page.route('**/api/today', (route) => route.fulfill({ json: emptyToday }));
}

test('Today loading skeleton', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockToday(page, { delay: 1200 });
  await page.goto('/today');
  await expect(page.getByRole('status', { name: 'Loading letters' })).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-loading.png', fullPage: true });
});

test('Today error and retry', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockToday(page, { status: 500 });
  await page.goto('/today');
  await expect(page.getByText("Couldn't load.")).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-error.png', fullPage: true });
});

test('empty household', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockToday(page);
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'Nothing needs you right now.' })).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-empty.png', fullPage: true });
});

test('letter processing steps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLetter(page, {
    ...baseLetter,
    status: 'queued',
    lane: null,
    kind: null,
    amountCents: null,
    dueDate: null,
    summaryParent: null,
    todoParent: null,
  });
  await page.goto('/letters/ltr_state');
  await expect(page.getByText('Reading the photo', { exact: false })).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-processing.png', fullPage: true });
});

test('provider timeout failure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLetter(page, {
    ...baseLetter,
    status: 'failed',
    lane: null,
    kind: null,
    amountCents: null,
    dueDate: null,
    error: 'Gateway request to ollama timed out',
  });
  await page.goto('/letters/ltr_state');
  await expect(page.getByText('Gateway request to ollama timed out')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-provider-timeout.png', fullPage: true });
});

test('needs retake state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockLetter(page, {
    ...baseLetter,
    status: 'needs_retake',
    lane: null,
    kind: null,
    amountCents: null,
    dueDate: null,
    summaryParent: null,
    todoParent: null,
  });
  await page.goto('/letters/ltr_state');
  await expect(page.getByText(/The photo was too dark or blurry to read/)).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-needs-retake.png', fullPage: true });
});

test('expired magic link', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login?error=expired');
  await expect(page.getByText('That link has expired. Ask for a new one.')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-expired-link.png', fullPage: true });
});

test('demo rate limit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/demo/today', (route) =>
    route.fulfill({
      json: { ...emptyToday, household: { ...emptyToday.household, id: 'hh_demo', isDemo: true } },
    }),
  );
  await page.route('**/api/demo/samples', (route) =>
    route.fulfill({
      json: [
        {
          id: 'L02',
          title: 'Riverbend PAST DUE',
          description: 'Second notice',
          photo: 'normal',
          imageUrl: image,
        },
      ],
    }),
  );
  await page.route(/\/api\/demo\/samples\/L02\/run$/, (route) =>
    route.fulfill({ status: 429, json: { error: 'rate_limited' } }),
  );
  await page.goto('/demo');
  await page.getByRole('button', { name: /Riverbend PAST DUE/ }).click();
  await expect(
    page.getByText('Lots of people are trying this right now. Try again in a few minutes.'),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-rate-limit.png', fullPage: true });
});

test('Mom upload error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/mom', (route) => route.fulfill({ json: emptyToday }));
  await page.route(/\/api\/letters$/, (route) =>
    route.fulfill({ status: 500, json: { error: 'internal' } }),
  );
  await page.goto('/mom');
  await page
    .locator('input[capture="environment"]')
    .setInputFiles({ name: 'letter.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('bad') });
  await expect(
    page.getByText('That file could not be read. Please try another photo.'),
  ).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-upload-error.png', fullPage: true });
});

test('case load error', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/cases/case_state', (route) =>
    route.fulfill({ status: 500, json: { error: 'internal' } }),
  );
  await page.goto('/cases/case_state');
  await expect(page.getByText("Couldn't load.")).toBeVisible();
  await page.screenshot({ path: 'docs/screens/state-case-error.png', fullPage: true });
});
