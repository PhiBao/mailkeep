const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function parseUsd(value: string): number | null {
  const match = value.replace(/\s/g, '').match(/^\$?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?$/);
  if (!match) return null;
  const dollars = Number((match[1] ?? '0').replaceAll(',', ''));
  const cents = Number((match[2] ?? '0').padEnd(2, '0'));
  return dollars * 100 + cents;
}

export function formatUsd(cents: number): string {
  return usd.format(cents / 100);
}
