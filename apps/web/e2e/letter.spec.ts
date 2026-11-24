import { expect, test } from '@playwright/test';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="520"><rect width="400" height="520" fill="#fffdf8"/><path d="M28 40h344M28 70h300M28 100h320M28 130h260" stroke="#6e7584" stroke-width="4"/></svg>')}`;
const letter = {
  id: 'ltr_L02',
  householdId: 'hh_test',
  source: 'upload',
  trial: false,
  submittedBy: null,
  receivedAt: '2026-12-09T12:00:00.000Z',
  status: 'done',
  mime: 'image/jpeg',
  title: 'Past Due Water Bill Notice',
  senderOrg: 'Riverbend Water Utility',
  summaryParent: 'The water bill is unpaid and now includes a late fee.',
  todoParent: 'Pay $89.17 by December 16.',
  kind: 'collection',
  lane: 'needs_you',
  amountCents: 8917,
  dueDate: '2026-12-16',
  accountTail: '4471',
  phones: ['(555) 010-4471'],
  scamRuleHits: [],
  transcript:
    'PAST DUE\nAccount ••4471\nNew balance due $89.17\nPayment deadline: December 16, 2026.',
  caseId: 'case_L01',
  error: null,
  imageUrl: image,
  checks: [
    {
      id: 'chk_1',
      key: 'same_matter_0',
      label: 'Same matter',
      qtype: 'noul',
      answer: '0.99',
      probability: 0.99,
      confidence: null,
      threshold: 0.85,
      outcome: 'linked',
    },
    {
      id: 'chk_2',
      key: 'follow_up_0',
      label: 'Follow up',
      qtype: 'noul',
      answer: '0.98',
      probability: 0.98,
      confidence: null,
      threshold: 0.8,
      outcome: 'reminder',
    },
  ],
  relations: [
    {
      id: 'rel_1',
      letterId: 'ltr_L02',
      otherLetterId: 'ltr_L01',
      relation: 'follow_up',
      probability: 0.98,
      recallScore: 0.91,
      status: 'accepted',
      createdAt: '2026-12-09T12:00:00.000Z',
    },
  ],
  recall: [
    {
      letterId: 'ltr_L01',
      title: 'November Water Bill',
      senderOrg: 'Riverbend Water Utility',
      receivedAt: '2026-11-18T12:00:00.000Z',
      kind: 'bill',
      lane: 'headsup',
      recallScore: 0.91,
      tailMatch: true,
      sameMatterProbability: 0.99,
    },
  ],
  outbox: [
    {
      id: 'out_1',
      kind: 'parent_note',
      toEmail: 'kiter7396+mom@gmail.com',
      subject: 'Sarah will look at: Past Due Water Bill Notice',
      status: 'sent',
      suppressedReason: null,
      agentmailMessageId: 'msg_1',
      agentmailThreadId: 'thread_1',
      createdAt: '2026-12-09T12:00:00.000Z',
      sentAt: '2026-12-09T12:01:00.000Z',
    },
  ],
  decision: {
    modelId: 'jev-1.14.0',
    latencyMs: 903,
    createdAt: '2026-12-09T12:00:00.000Z',
    questionCount: 33,
    jevTokens: 212,
    ollamaInTokens: 900,
    ollamaOutTokens: 300,
    costMicrousd: 510,
    rawResponseUrl: `data:application/json;base64,${Buffer.from('{"model":"jev-1.14.0"}').toString('base64')}`,
  },
};
const today = {
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

for (const width of [390, 1440]) {
  test(`Letter shows the full decision at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.route('**/api/letters/ltr_L02', (route) => route.fulfill({ json: letter }));
    await page.route('**/api/today', (route) => route.fulfill({ json: today }));
    await page.goto('/letters/ltr_L02');
    await expect(page.getByRole('heading', { name: 'Past Due Water Bill Notice' })).toBeVisible();
    await expect(page.getByText('NEEDS YOU', { exact: true })).toBeVisible();
    await expect(
      page.getByText('The water bill is unpaid and now includes a late fee.'),
    ).toBeVisible();
    await expect(page.getByText(/Sent .*kiter7396\+mom@gmail.com/)).toBeVisible();
    await expect(page.getByText(/Pay \$89.17 by December 16/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open the case file' })).toBeVisible();
    await expect(page.getByText('second notice · 0.98')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'linked', exact: true })).toBeVisible();
    await expect(page.getByText(/recall 0.91/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Raw response' })).toHaveAttribute('download', '');
    await page.getByText('Show what Mailkeep read', { exact: true }).click();
    await expect(page.getByText(/PAST DUE/)).toBeVisible();
    await page.getByRole('button', { name: /Letter from Riverbend/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Close photo' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await page.screenshot({ path: `docs/screens/letter-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}

test('Letter polls through processing and flips to done', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/letters/ltr_L02', (route) => {
    reads += 1;
    return route.fulfill({
      json:
        reads < 3
          ? {
              ...letter,
              status: 'reading',
              lane: null,
              checks: [],
              relations: [],
              recall: [],
              outbox: [],
              decision: null,
            }
          : letter,
    });
  });
  await page.route('**/api/today', (route) => route.fulfill({ json: today }));
  await page.goto('/letters/ltr_L02');
  await expect(page.getByText('Reading the photo', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Past Due Water Bill Notice' })).toBeVisible();
  await expect(page.getByText('NEEDS YOU', { exact: true })).toBeVisible({ timeout: 6000 });
});
