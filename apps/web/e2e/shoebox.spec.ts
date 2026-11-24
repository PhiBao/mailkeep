import { expect, test } from '@playwright/test';

const lanes = ['handled', 'headsup', 'needs_you', 'careful'] as const;
const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="100"><rect width="80" height="100" fill="#fffdf8"/></svg>')}`;

function letter(index: number, status: 'queued' | 'done' = 'queued') {
  return {
    id: `ltr_${index}`,
    householdId: 'hh_test',
    source: 'upload',
    trial: false,
    submittedBy: null,
    receivedAt: '2026-12-09T12:00:00.000Z',
    status,
    mime: 'image/jpeg',
    title: `Letter ${index + 1}`,
    senderOrg: 'Riverbend Water Utility',
    summaryParent: 'A synthetic letter.',
    todoParent: null,
    kind: 'bill',
    lane: status === 'done' ? lanes[index % lanes.length] : null,
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
    decision:
      status === 'done'
        ? {
            modelId: 'jev-1.14.0',
            latencyMs: 100,
            createdAt: '2026-12-09T12:00:00.000Z',
            questionCount: 10,
            jevTokens: 10,
            ollamaInTokens: 10,
            ollamaOutTokens: 10,
            costMicrousd: 100,
            rawResponseUrl: '/raw',
          }
        : null,
  };
}

test('Shoebox uploads twelve letters sequentially and updates live tallies', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let uploads = 0;
  let active = 0;
  let maxActive = 0;
  await page.route(/\/api\/letters$/, async (route) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    const index = uploads++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    active -= 1;
    await route.fulfill({ status: 202, json: [letter(index)] });
  });
  await page.route(/\/api\/letters\/ltr_\d+$/, (route) => {
    const id =
      route
        .request()
        .url()
        .match(/ltr_(\d+)$/)?.[1] ?? '0';
    return route.fulfill({ json: letter(Number(id), 'done') });
  });
  await page.goto('/shoebox');
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 12 }, (_, index) => ({
      name: `letter-${index + 1}.jpg`,
      mimeType: 'image/jpeg',
      buffer: Buffer.from(`synthetic-${index}`),
    })),
  );
  await expect(page.locator('.shoebox__item')).toHaveCount(12);
  await expect(page.locator('.shoebox__tallies')).toContainText(
    'HANDLED 3 · HEADS-UP 3 · NEEDS YOU 3 · CAREFUL 3',
  );
  expect(uploads).toBe(12);
  expect(maxActive).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: 'docs/screens/shoebox-390.png', fullPage: true });
});
