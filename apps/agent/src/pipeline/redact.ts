const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD = /\b(?:\d[ -]?){12,18}\d\b/g;
const MBI = /\b[1-9][A-Z][A-Z0-9]\d[A-Z][A-Z0-9]\d[A-Z][A-Z0-9]\d[A-Z0-9]\b/gi;
const LABELLED =
  /\b(account|acct|policy|member\s*id|claim|reference|ref)\b\s*(?:number|no\.?|#)?\s*[:#-]?\s*([A-Z0-9-]{6,20})\b/gi;

export interface RedactionResult {
  text: string;
  accountTail: string | null;
}

function luhn(value: string): boolean {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index]);
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

export function redact(input: string): RedactionResult {
  let text = input.replace(SSN, '[SSN]');
  text = text.replace(CARD, (match) => {
    if (!luhn(match)) return match;
    const digits = match.replace(/\D/g, '');
    return `[CARD ••${digits.slice(-4)}]`;
  });
  text = text.replace(MBI, '[ID]');

  const matches = [...text.matchAll(LABELLED)];
  const accountMatch = matches.find((match) => /^(account|acct)$/i.test(match[1] ?? ''));
  const selected = accountMatch ?? matches.at(-1);
  const accountTail = selected?.[2]?.replace(/\D/g, '').slice(-4) || null;
  text = text.replace(LABELLED, (_match, label: string, identifier: string) => {
    const tail = identifier.replace(/\D/g, '').slice(-4);
    return `${label} ••${tail}`;
  });

  return { text, accountTail };
}
