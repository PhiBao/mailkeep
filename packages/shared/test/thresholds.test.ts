import { describe, expect, it } from 'vitest';
import { T } from '../src/thresholds.js';

describe('routing thresholds', () => {
  it('keeps each ask band below its acceptance bar', () => {
    expect(T.linkAsk).toBeLessThan(T.linkAccept);
    expect(T.completesAsk).toBeLessThan(T.completesAccept);
  });

  it('keeps the scam bar at or below the approved conservative value', () => {
    expect(T.scamAny).toBeLessThanOrEqual(0.5);
  });
});
