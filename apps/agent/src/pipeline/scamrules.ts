export type ScamRule =
  | 'gift_card'
  | 'crypto'
  | 'wire_transfer'
  | 'secrecy'
  | 'ssn_suspended'
  | 'arrest_warrant'
  | 'not_government'
  | 'prize_fee';

const RULES: Array<{ key: ScamRule; pattern: RegExp }> = [
  { key: 'gift_card', pattern: /\bgift\s*cards?\b/i },
  { key: 'crypto', pattern: /\b(?:bitcoin|crypto(?:currency)?)\b/i },
  { key: 'wire_transfer', pattern: /\b(?:wire\s+transfer|western\s+union|moneygram)\b/i },
  {
    key: 'secrecy',
    pattern: /\b(?:do\s+not|don['’]t)\s+tell\b[^.]{0,80}\b(?:bank|family|anyone)\b/i,
  },
  { key: 'ssn_suspended', pattern: /social\s+security\s+number\s+(?:has\s+been|is)\s+suspended/i },
  { key: 'arrest_warrant', pattern: /\barrest\s+warrant\b/i },
  {
    key: 'not_government',
    pattern: /not\s+affiliated\s+with\s+any\s+(?:government|county|state|federal)\b/i,
  },
  {
    key: 'prize_fee',
    pattern:
      /\bprocessing\s+fee\b.{0,160}\b(?:won|winner|prize)\b|\b(?:won|winner|prize)\b.{0,160}\bprocessing\s+fee\b/is,
  },
];

export function scamRuleHits(text: string): ScamRule[] {
  return RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.key);
}
