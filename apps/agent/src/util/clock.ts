const DAY_MS = 24 * 60 * 60 * 1000;

export interface HouseholdClock {
  clock_offset_days: number;
  timezone: string;
}

export function now(household: HouseholdClock, realNow = new Date()): Date {
  return new Date(realNow.getTime() + household.clock_offset_days * DAY_MS);
}

export function todayIso(household: HouseholdClock, realNow = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: household.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now(household, realNow));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
