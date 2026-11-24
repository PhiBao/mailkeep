import { expect, test } from '@playwright/test';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#fffdf8"/><path d="M12 18h56M12 30h56" stroke="#6e7584"/></svg>')}`;
const today = {
  household: {
    id: 'hh_demo',
    name: "Ruth's mail",
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    isDemo: true,
    today: '2026-12-09',
  },
  asks: [
    {
      id: 'ask_demo',
      letterId: 'ltr_demo',
      caseId: 'case_demo',
      qtype: 'link',
      question: 'Is this the same water bill as the one from Nov 18?',
      evidence: 'same account ••4471 · 0.71 < 0.85',
      options: [{ value: 'yes', label: 'Yes' }],
      status: 'open',
      createdAt: '2026-12-09T12:00:00.000Z',
      letterTitle: 'Past Due Water Bill Notice',
    },
  ],
  upcoming: [
    {
      caseId: 'case_demo',
      title: 'November Water Bill',
      counterparty: 'Riverbend Water Utility',
      kind: 'bill',
      status: 'open',
      amountCents: 8417,
      dueDate: '2026-12-10',
      daysLeft: 1,
      secondNotice: true,
    },
  ],
  handledThisWeek: { count: 0, items: [] },
  recent: [
    {
      id: 'ltr_demo',
      title: 'Past Due Water Bill Notice',
      senderOrg: 'Riverbend Water Utility',
      receivedAt: '2026-12-09T12:00:00.000Z',
      status: 'done',
      lane: 'needs_you',
      kind: 'collection',
      summaryParent: 'The water bill is past due.',
      todoParent: 'Pay $89.17.',
      amountCents: 8917,
      dueDate: '2026-12-16',
      caseId: 'case_demo',
      trial: true,
      imageUrl: image,
    },
  ],
};
const samples = [
  {
    id: 'L02',
    title: 'Riverbend PAST DUE',
    description: 'A second notice that links to the Nov 18 bill.',
    photo: 'normal',
    imageUrl: image,
  },
];
const trial = {
  id: 'ltr_trial',
  householdId: 'hh_demo',
  source: 'sample',
  trial: true,
  submittedBy: null,
  receivedAt: '2026-12-09T12:00:00.000Z',
  status: 'done',
  mime: 'image/jpeg',
  title: 'Past Due Water Bill Notice',
  senderOrg: 'Riverbend Water Utility',
  summaryParent: 'The water bill is past due.',
  todoParent: 'Pay $89.17.',
  kind: 'collection',
  lane: 'needs_you',
  amountCents: 8917,
  dueDate: '2026-12-16',
  accountTail: '4471',
  phones: [],
  scamRuleHits: [],
  transcript: 'PAST DUE water bill.',
  caseId: 'case_demo',
  error: null,
  imageUrl: image,
  checks: [],
  relations: [],
  recall: [],
  outbox: [],
  decision: null,
};

for (const width of [390, 1440]) {
  test(`Demo is public and read-only at ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    expect((await context.cookies()).length).toBe(0);
    await page.route('**/api/demo/today', (route) => route.fulfill({ json: today }));
    await page.route('**/api/demo/samples', (route) => route.fulfill({ json: samples }));
    await page.route(/\/api\/demo\/samples\/L02\/run$/, (route) =>
      route.fulfill({ status: 202, json: trial }),
    );
    await page.route('**/api/demo/letters/ltr_trial', (route) => route.fulfill({ json: trial }));
    await page.goto('/demo');
    await expect(page.getByText(/Demo household · synthetic letters/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Yes', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: /Riverbend PAST DUE/ })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `docs/screens/demo-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: /Riverbend PAST DUE/ }).click();
    await expect(page).toHaveURL(/\/demo\/letters\/ltr_trial$/);
    await expect(page.getByRole('heading', { name: 'Past Due Water Bill Notice' })).toBeVisible();
  });
}
