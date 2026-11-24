import { expect, test } from '@playwright/test';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#fffdf8"/><path d="M28 40h344M28 70h300" stroke="#6e7584" stroke-width="4"/></svg>')}`;
const mom = {
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
  handledThisWeek: { count: 1, items: [] },
  recent: [
    {
      id: 'ltr_old',
      title: 'November Water Bill',
      senderOrg: 'Riverbend Water Utility',
      receivedAt: '2026-11-18T12:00:00.000Z',
      status: 'done',
      lane: 'handled',
      kind: 'bill',
      summaryParent: 'Nothing to do.',
      todoParent: null,
      amountCents: null,
      dueDate: null,
      caseId: null,
      trial: false,
      imageUrl: image,
    },
  ],
};
const queued = {
  id: 'ltr_new',
  householdId: 'hh_test',
  source: 'upload',
  trial: false,
  submittedBy: 'mem_ruth',
  receivedAt: '2026-12-09T12:00:00.000Z',
  status: 'queued',
  mime: 'image/jpeg',
  title: 'November Water Bill',
  senderOrg: null,
  summaryParent: null,
  todoParent: null,
  kind: null,
  lane: null,
  amountCents: null,
  dueDate: null,
  accountTail: null,
  phones: [],
  scamRuleHits: [],
  transcript: '',
  caseId: null,
  error: null,
  imageUrl: image,
  checks: [],
  relations: [],
  recall: [],
  outbox: [],
  decision: null,
};
const done = {
  ...queued,
  status: 'done',
  senderOrg: 'Riverbend Water Utility',
  summaryParent: 'The water bill is due.',
  todoParent: 'Pay $84.17 by December 10.',
  kind: 'bill',
  lane: 'headsup',
  amountCents: 8417,
  dueDate: '2026-12-10',
};

test('Mom uploads a photo and shows one plain result without probabilities', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let reads = 0;
  await page.route('**/api/mom', (route) => route.fulfill({ json: mom }));
  await page.route(/\/api\/letters$/, async (route) => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({ status: 202, json: [queued] });
  });
  await page.route('**/api/letters/ltr_new', (route) => {
    reads += 1;
    return route.fulfill({ json: reads < 3 ? queued : done });
  });
  await page.goto('/mom');
  await expect(page.getByRole('heading', { name: "Ruth's mail" })).toBeVisible();
  await page.locator('input[capture="environment"]').setInputFiles({
    name: 'letter.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from('not-a-real-image'),
  });
  await expect(page.getByText('Reading your letter…')).toBeVisible();
  await expect(page.getByText('Pay $84.17 by December 10.')).toBeVisible({ timeout: 6000 });
  await expect(page.getByText('Your last letters')).toBeVisible();
  expect(await page.locator('body').textContent()).not.toContain('0.97');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screens/mom-390.png', fullPage: true });
});

test('Login always gives the non-enumerating confirmation', async ({ page }) => {
  let submitted = '';
  await page.route('**/auth/link', async (route) => {
    submitted = route.request().postDataJSON().email;
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  await page.goto('/login');
  await page.getByLabel('Email address').fill('kiter7396+mom@gmail.com');
  await page.getByRole('button', { name: 'Email me a link' }).click();
  await expect(page.getByRole('status')).toHaveText(
    'If that address belongs to a household, a link is on its way.',
  );
  expect(submitted).toBe('kiter7396+mom@gmail.com');
  await page.screenshot({ path: 'docs/screens/login-390.png', fullPage: true });
});

test('Login explains an expired magic link', async ({ page }) => {
  await page.goto('/login?error=expired');
  await expect(page.getByText('That link has expired. Ask for a new one.')).toBeVisible();
});
