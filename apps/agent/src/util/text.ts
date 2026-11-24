export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function firstLines(value: string, count: number): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, count)
    .join(' ');
}

export function truncate(value: string, length: number): string {
  return value.length <= length ? value : value.slice(0, length);
}
