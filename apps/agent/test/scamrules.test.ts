import { describe, expect, it } from 'vitest';
import { scamRuleHits } from '../src/pipeline/scamrules.js';

describe('code-owned scam rules', () => {
  it.each([
    ['gift cards', 'gift_card'],
    ['bitcoin', 'crypto'],
    ['cryptocurrency', 'crypto'],
    ['wire transfer', 'wire_transfer'],
    ['Western Union', 'wire_transfer'],
    ['MoneyGram', 'wire_transfer'],
    ["Don't tell your bank", 'secrecy'],
    ['do not tell anyone', 'secrecy'],
    ['Social Security number has been suspended', 'ssn_suspended'],
    ['arrest warrant', 'arrest_warrant'],
    ['not affiliated with any government agency', 'not_government'],
  ])('flags %s', (text, rule) => {
    expect(scamRuleHits(text)).toContain(rule);
  });

  it('requires both a processing fee and prize language', () => {
    expect(scamRuleHits('You won a prize. Pay a processing fee.')).toContain('prize_fee');
    expect(scamRuleHits('A processing fee applies to the winner.')).toContain('prize_fee');
    expect(scamRuleHits('A processing fee applies to your account.')).not.toContain('prize_fee');
  });

  it('does not flag the genuine retirement statement wording', () => {
    const text =
      'Westmark State Retirement System annual pension statement. Your benefits number is active. This is not a bill. No payment is requested.';
    expect(scamRuleHits(text)).toEqual([]);
  });
});
