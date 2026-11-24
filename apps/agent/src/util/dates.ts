const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function validIso(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseDateCandidate(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return validIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (numeric) {
    let year = Number(numeric[3]);
    if (year < 100) year += 2000;
    return validIso(year, Number(numeric[1]), Number(numeric[2]));
  }

  const named = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,)?\s+(\d{4})$/);
  if (named) {
    const month = MONTHS[named[1]?.toLowerCase() ?? ''];
    if (month === undefined) return null;
    return validIso(Number(named[3]), month + 1, Number(named[2]));
  }
  return null;
}
