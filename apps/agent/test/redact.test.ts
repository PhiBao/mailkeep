import { describe, expect, it } from 'vitest';
import { redact } from '../src/pipeline/redact.js';

describe('redaction', () => {
  it('redacts SSNs and Luhn-valid cards only', () => {
    const result = redact(
      'SSN 123-45-6789. Card 4111 1111 1111 1111. Invalid 4111 1111 1111 1112.',
    );
    expect(result.text).toContain('[SSN]');
    expect(result.text).toContain('[CARD ••1111]');
    expect(result.text).toContain('4111 1111 1111 1112');
    expect(result.text).not.toContain('123-45-6789');
  });

  it('redacts labelled identifiers and prefers the first account tail', () => {
    const result = redact(
      'Account 7720-114471. Policy LM-AU-205512. Member ID MSH-55-8830. Claim CLM-261102-8830. Reference ARS-261127-3381. Acct 0000-009999.',
    );
    expect(result.text).toContain('Account ••4471');
    expect(result.text).toContain('Policy ••5512');
    expect(result.text).toContain('Member ID ••8830');
    expect(result.text).toContain('Claim ••8830');
    expect(result.text).toContain('Reference ••3381');
    expect(result.accountTail).toBe('4471');
  });

  it('redacts Medicare-style identifiers', () => {
    const result = redact('Member number 1EG4TE5MK73.');
    expect(result.text).toContain('[ID]');
    expect(result.text).not.toContain('1EG4TE5MK73');
  });
});
