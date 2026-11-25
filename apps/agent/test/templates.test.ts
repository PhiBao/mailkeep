import { describe, expect, it } from 'vitest';
import { familyAlert } from '../src/notify/templates.js';
import type { RouteOutput } from '../src/pipeline/route.js';

describe('family alert copy', () => {
  it('tells the family how to mark a second notice paid', () => {
    const route: RouteOutput = {
      lane: 'needs_you',
      kind: 'collection',
      amountCents: null,
      dueDate: '2026-12-16',
      relations: [],
      caseChange: {
        action: 'update',
        caseId: 'case_1',
        title: 'Past Due Water Bill Notice',
        counterparty: 'Riverbend Water Utility',
        kind: 'collection',
        status: 'open',
        amountCents: null,
        dueDate: '2026-12-16',
        secondNotice: true,
        contradiction: false,
      },
      asks: [],
      notes: ['Second notice for this bill.'],
      checks: [],
      familyAlert: true,
    };
    const alert = familyAlert({
      parentDisplay: 'Ruth',
      title: 'Past Due Water Bill Notice',
      route,
      checks: [],
      link: 'https://mailkeep.example/letters/ltr_1',
    });
    expect(alert.body).toContain('Reply PAID');
    expect(alert.body).toContain('https://mailkeep.example/letters/ltr_1');
  });
});
