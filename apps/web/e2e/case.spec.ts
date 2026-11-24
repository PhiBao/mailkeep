import { expect, test } from '@playwright/test';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#fffdf8"/><path d="M12 18h56M12 30h56M12 42h42" stroke="#6e7584"/></svg>')}`;
const baseCase = {
  id: 'case_L01',
  householdId: 'hh_test',
  title: 'November Water Bill',
  counterparty: 'Riverbend Water Utility',
  kind: 'bill',
  status: 'open',
  amountCents: 8917,
  dueDate: '2026-12-16',
  accountTail: '4471',
  secondNotice: true,
  contradiction: false,
  boxFolderUrl: null,
  letters: [
    {
      id: 'ltr_L01',
      title: 'November Water Bill',
      senderOrg: 'Riverbend Water Utility',
      receivedAt: '2026-11-18T12:00:00.000Z',
      status: 'done',
      lane: 'headsup',
      kind: 'bill',
      summaryParent: 'Pay the November water bill.',
      todoParent: 'Pay $84.17 by December 10.',
      amountCents: 8417,
      dueDate: '2026-12-10',
      caseId: 'case_L01',
      trial: false,
      imageUrl: image,
    },
    {
      id: 'ltr_L02',
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
      caseId: 'case_L01',
      trial: false,
      imageUrl: image,
    },
  ],
  events: [
    {
      id: 'evt_1',
      caseId: 'case_L01',
      letterId: 'ltr_L01',
      type: 'opened',
      actor: 'agent',
      memberId: null,
      detail: {},
      createdAt: '2026-11-18T12:01:00.000Z',
    },
    {
      id: 'evt_2',
      caseId: 'case_L01',
      letterId: 'ltr_L02',
      type: 'reminder_received',
      actor: 'agent',
      memberId: null,
      detail: {},
      createdAt: '2026-12-09T12:01:00.000Z',
    },
    {
      id: 'evt_3',
      caseId: 'case_L01',
      letterId: 'ltr_L02',
      type: 'answered',
      actor: 'member',
      memberId: 'mem_sarah',
      detail: { answer: 'yes' },
      createdAt: '2026-12-09T12:05:00.000Z',
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
    {
      id: 'rel_2',
      letterId: 'ltr_L02',
      otherLetterId: 'ltr_L01',
      relation: 'same_matter',
      probability: 0.99,
      recallScore: 0.91,
      status: 'accepted',
      createdAt: '2026-12-09T12:00:00.000Z',
    },
  ],
};

for (const width of [390, 1440]) {
  test(`Case thread shows the second notice and updates at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    let current = structuredClone(baseCase);
    await page.route(/\/api\/cases\/case_L01(?:\/[^/]+)?$/, async (route) => {
      if (route.request().method() === 'POST') {
        const action = route.request().url().endsWith('/mark-paid') ? 'paid' : 'open';
        current = { ...current, status: action };
        await route.fulfill({ json: { ok: true } });
        return;
      }
      await route.fulfill({ json: current });
    });
    await page.goto('/cases/case_L01');
    await expect(page.getByRole('heading', { name: /Riverbend Water Utility/ })).toBeVisible();
    await expect(page.getByText('November Water Bill', { exact: true })).toBeVisible();
    await expect(page.getByText('Past Due Water Bill Notice', { exact: true })).toBeVisible();
    await expect(page.getByText('↳ second notice for this bill · 0.98')).toBeVisible();
    await expect(page.getByText(/Family answered: yes/)).toBeVisible();
    await page.screenshot({ path: `docs/screens/case-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Mark paid', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Reopen', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Reopen', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark paid', exact: true })).toBeVisible();
  });
}
