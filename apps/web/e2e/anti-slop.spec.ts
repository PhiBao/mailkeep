import { expect, type Page, test } from '@playwright/test';

const image = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="200"><rect width="160" height="200" fill="#fffdf8"/><path d="M18 24h124M18 44h124M18 64h96" stroke="#646b78" stroke-width="3"/></svg>')}`;
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
      evidence: 'same account ••4471 · 0.71 < 0.85',
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
      secondNotice: true,
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
  summaryParent: 'The water bill is past due.',
  todoParent: 'Pay $89.17 by December 16.',
  kind: 'collection',
  lane: 'needs_you',
  amountCents: 8917,
  dueDate: '2026-12-16',
  accountTail: '4471',
  phones: [],
  scamRuleHits: [],
  transcript: 'PAST DUE water bill.',
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
      subject: 'Sarah will look at it',
      bodyText: 'Hi Ruth, keep this one for now. Sarah will look at it. — Mailkeep',
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
    rawResponseUrl: '/api/letters/ltr_L02/decision',
  },
};
const caseDto = {
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
  letters: [letter],
  events: [
    {
      id: 'evt_1',
      caseId: 'case_L01',
      letterId: 'ltr_L02',
      type: 'reminder_received',
      actor: 'agent',
      memberId: null,
      detail: {},
      createdAt: '2026-12-09T12:00:00.000Z',
    },
  ],
  relations: letter.relations,
};
const proof = {
  capturedAt: '2026-11-25T14:30:00.000Z',
  where: {
    spriteName: 'mailkeep',
    url: 'https://mailkeep-hl3m.sprites.app',
    serviceStatus: 'running',
    gitSha: 'be76da8568fc8bb5a33765f36cb2621bbb83aeaf',
    uptime: '2h 14m',
  },
  connectors: [
    { provider: 'agentmail', connectionIdPrefix: 'oFVcFZMw', credentialLocation: 'Fly connector' },
    { provider: 'box', connectionIdPrefix: 'D6Q3d2I6', credentialLocation: 'Fly connector' },
    { provider: 'ollama', connectionIdPrefix: 'Xuv-D-ig', credentialLocation: 'Fly connector' },
    { provider: 'pinecone', connectionIdPrefix: 'anVdybVe', credentialLocation: 'Fly connector' },
    { provider: 'typesafe', connectionIdPrefix: 'nzOp5iVC', credentialLocation: 'Fly connector' },
  ],
  keyscan: {
    found: 0,
    checkedAt: '2026-11-25T04:00:00.000Z',
    envVarNames: ['MAILKEEP_PUBLIC_URL', 'PORT'],
  },
  thresholds: [{ key: 'linkAccept', bar: 0.85, effect: 'Link to the past letter’s case.' }],
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
    difference: 'Mailkeep links household mail over time.',
  },
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

async function mockScreen(page: Page, _screen: string) {
  await page.route('**/api/today', (route) => route.fulfill({ json: today }));
  await page.route('**/api/mom', (route) => route.fulfill({ json: today }));
  await page.route('**/api/letters/ltr_L02', (route) => route.fulfill({ json: letter }));
  await page.route('**/api/cases/case_L01', (route) => route.fulfill({ json: caseDto }));
  await page.route('**/api/proof', (route) => route.fulfill({ json: proof }));
  await page.route('**/api/demo/today', (route) =>
    route.fulfill({
      json: { ...today, household: { ...today.household, id: 'hh_demo', isDemo: true } },
    }),
  );
  await page.route('**/api/demo/samples', (route) => route.fulfill({ json: samples }));
}

const screens = [
  ['home', '/'],
  ['login', '/login'],
  ['today', '/today'],
  ['case', '/cases/case_L01'],
  ['letter', '/letters/ltr_L02'],
  ['mom', '/mom'],
  ['proof', '/proof'],
  ['demo', '/demo'],
  ['shoebox', '/shoebox'],
] as const;

for (const width of [320, 390, 1440]) {
  for (const motion of ['on', 'off'] as const) {
    for (const [screen, url] of screens) {
      test(`${screen} ${width}px motion ${motion}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
        await page.emulateMedia({ reducedMotion: motion === 'off' ? 'reduce' : 'no-preference' });
        await mockScreen(page, screen);
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: `docs/screens/anti-slop-${screen}-${width}-${motion}.png`,
          fullPage: true,
        });
      });
    }
  }
}

test('reduced motion disables stamp, thread and skeleton animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockScreen(page, 'today');
  await page.goto('/today');
  await expect(page.locator('.stamp').first()).toBeVisible();
  const names = await page
    .locator('.stamp')
    .first()
    .evaluate((element) => getComputedStyle(element).animationName);
  expect(names).toBe('none');
});
