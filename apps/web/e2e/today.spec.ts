import { expect, test } from '@playwright/test';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#fffdf8"/><path d="M12 18h56M12 30h56M12 42h42" stroke="#6e7584"/></svg>')}`;
const today = {
  household: {
    id: 'hh_test',
    name: "Ruth's mail",
    parentDisplay: 'Ruth',
    timezone: 'America/Chicago',
    isDemo: false,
    today: '2026-12-09',
  },
  asks: [
    {
      id: 'ask_1',
      letterId: 'ltr_L02',
      caseId: 'case_L01',
      qtype: 'link',
      question: 'Is this the same water bill as the one from Nov 18?',
      evidence: 'same account ••4471 · same sender · 0.71 < 0.85',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
      status: 'open',
      createdAt: '2026-12-09T12:00:00.000Z',
      letterTitle: 'Past Due Water Bill Notice',
    },
  ],
  upcoming: [
    {
      caseId: 'case_L01',
      title: 'November Water Bill',
      counterparty: 'Riverbend Water Utility',
      kind: 'bill',
      status: 'open',
      amountCents: 8417,
      dueDate: '2026-12-10',
      daysLeft: 1,
      secondNotice: false,
    },
  ],
  handledThisWeek: {
    count: 1,
    items: [
      {
        id: 'ltr_L06',
        title: 'Explanation of Benefits Statement',
        senderOrg: 'Maple Senior Health Plan',
        receivedAt: '2026-11-16T12:00:00.000Z',
        status: 'done',
        lane: 'handled',
        kind: 'statement',
        summaryParent: 'This is not a bill.',
        todoParent: null,
        amountCents: null,
        dueDate: null,
        caseId: null,
        trial: false,
        imageUrl: image,
      },
    ],
  },
  recent: [],
};

test('Today keeps a CAREFUL watch case in Needs you without a due date', async ({ page }) => {
  const carefulToday = {
    ...structuredClone(today),
    asks: [],
    upcoming: [
      {
        caseId: 'case_watch',
        title: 'Careful: Global Prize Center',
        counterparty: 'Global Prize Center',
        kind: 'marketing',
        status: 'watch',
        amountCents: null,
        dueDate: null,
        daysLeft: 0,
        secondNotice: false,
      },
    ],
    handledThisWeek: { count: 0, items: [] },
  };
  await page.route('**/api/today', (route) => route.fulfill({ json: carefulToday }));
  await page.goto('/today');
  await expect(page.getByRole('heading', { name: 'This letter looks like a scam.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nothing needs you right now.' })).toHaveCount(0);
});

for (const width of [390, 1440]) {
  test(`Today answers an Ask in place at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    const answers: string[] = [];
    let current = structuredClone(today);
    await page.route('**/api/today', async (route) => {
      await route.fulfill({ json: current });
    });
    await page.route('**/api/asks/ask_1/answer', async (route) => {
      answers.push(route.request().postDataJSON().answer);
      current = { ...current, asks: [] };
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto('/today');
    await expect(page.getByRole('heading', { name: 'Needs you' })).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Is this the same water bill as the one from Nov 18?',
      }),
    ).toBeVisible();
    await expect(page.getByText('Riverbend Water Utility · second notice')).toHaveCount(0);
    await page.screenshot({ path: `docs/screens/today-${width}.png`, fullPage: true });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByTestId('ask-ask_1')).toHaveCount(0);
    await expect(page.getByRole('status')).toContainText('Saved. Case updated.');
    expect(answers).toEqual(['yes']);
  });
}
