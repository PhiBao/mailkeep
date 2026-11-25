import { describe, expect, it } from 'vitest';
import { renderEvalMarkdown } from './report.js';

const metrics = {
  letters: 0,
  laneAccuracy: 1,
  unsafe: 0,
  falseAlarms: 0,
  scamsCaught: 0,
  scamsTotal: 0,
  linkPrecision: 1,
  linkRecall: 1,
  amountAccuracy: 1,
  dueAccuracy: 1,
  askRate: 0,
  averageCostMicrousd: 0,
  averageLatencyMs: 0,
};

describe('held-out report', () => {
  it('appends the untuned held-out section without replacing the non-held-out report', () => {
    const common = {
      metrics,
      results: [],
      modelIds: ['jev-1.14.0', 'gemma4:31b'],
      thresholdsVersion: '2026-11-24.3',
    };
    const nonheld = renderEvalMarkdown({
      ...common,
      runId: 'eval-baseline',
      generatedAt: '2026-11-24T20:00:00.000Z',
      heldout: false,
    });
    const combined = renderEvalMarkdown({
      ...common,
      runId: 'heldout-final',
      generatedAt: '2026-11-25T04:00:00.000Z',
      heldout: true,
      previousMarkdown: nonheld,
    });
    expect(combined.startsWith(nonheld.trim())).toBe(true);
    expect(combined).toContain('## Held-out (run once, untuned)');
    expect(combined.match(/^# /gm)).toHaveLength(1);
    expect(combined).toContain('heldout-final');
  });
});
