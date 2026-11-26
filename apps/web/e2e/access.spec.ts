import { expect, test } from '@playwright/test';

const publicLinks = [
  { name: 'public repo', url: 'https://github.com/PhiBao/mailkeep' },
  { name: 'README', url: 'https://github.com/PhiBao/mailkeep/blob/main/README.md' },
  { name: 'evaluation', url: 'https://github.com/PhiBao/mailkeep/blob/main/EVAL.md' },
  { name: 'live home', url: 'https://mailkeep-hl3m.sprites.app/' },
  { name: 'live demo', url: 'https://mailkeep-hl3m.sprites.app/demo' },
  { name: 'live proof', url: 'https://mailkeep-hl3m.sprites.app/proof' },
  { name: 'proof API', url: 'https://mailkeep-hl3m.sprites.app/api/proof' },
];

for (const link of publicLinks) {
  test(`${link.name} opens without a session`, async ({ page, context }) => {
    expect(await context.cookies()).toEqual([]);
    const response = await page.goto(link.url, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), link.url).toBe(200);
    if (new URL(link.url).hostname === 'mailkeep-hl3m.sprites.app') {
      expect(await context.cookies()).toEqual([]);
    }
  });
}

test('logged-out home, demo and proof show the public product', async ({ page, context }) => {
  expect(await context.cookies()).toEqual([]);
  await page.goto('https://mailkeep-hl3m.sprites.app/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Mailkeep remembers every letter Mom gets',
  );

  await page.goto('https://mailkeep-hl3m.sprites.app/demo');
  await expect(page.getByText(/Demo household · synthetic letters/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Riverbend PAST DUE/ })).toBeVisible();

  await page.goto('https://mailkeep-hl3m.sprites.app/proof');
  await expect(page.getByRole('heading', { name: 'How Mailkeep runs' })).toBeVisible();
  await expect(page.getByText(/Provider keys found on this Sprite: 0/)).toBeVisible();
  expect(await context.cookies()).toEqual([]);
});

test('proof API is public JSON with zero keys and five connectors', async ({ request }) => {
  const response = await request.get('https://mailkeep-hl3m.sprites.app/api/proof');
  expect(response.status()).toBe(200);
  const proof = await response.json();
  expect(proof.keyscan.found).toBe(0);
  expect(proof.connectors).toHaveLength(5);
  expect(proof.where.serviceStatus).toBe('running');
});

test.skip('Box shared folder opens publicly', async () => {
  // H8: founder must share folder 440822123671 and supply the real URL.
});

test.skip('demo video opens publicly', async () => {
  // H9: the cut is ready; founder must upload it with the launch post and supply the URL.
});

test.skip('social post opens publicly and tags @flydotio', async () => {
  // H9: founder must publish the post with the video and supply the public URL.
});
