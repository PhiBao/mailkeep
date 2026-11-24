import { parseDateCandidate } from '../util/dates.js';
import { parseUsd } from '../util/money.js';

export interface AmountCandidate {
  id: string;
  text: string;
  context: string;
  amountCents: number;
}

export interface DateCandidate {
  id: string;
  text: string;
  context: string;
  iso: string;
}

export interface PhoneCandidate {
  id: string;
  text: string;
  context: string;
}

const AMOUNT = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;
const DATE =
  /\b(?:[A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{1,2}-\d{1,2})\b/g;
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}/g;

function context(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 40), Math.min(text.length, index + length + 40)).trim();
}

export function amountCandidates(text: string, limit = 8): AmountCandidate[] {
  return [...text.matchAll(AMOUNT)].slice(0, limit).flatMap((match, index) => {
    const amountCents = parseUsd(match[0]);
    if (amountCents === null) return [];
    return [
      {
        id: `a${index}`,
        text: match[0],
        context: context(text, match.index ?? 0, match[0].length),
        amountCents,
      },
    ];
  });
}

export function dateCandidates(text: string, limit = 8): DateCandidate[] {
  return [...text.matchAll(DATE)].slice(0, limit).flatMap((match, index) => {
    const iso = parseDateCandidate(match[0]);
    if (!iso) return [];
    return [
      {
        id: `d${index}`,
        text: match[0],
        context: context(text, match.index ?? 0, match[0].length),
        iso,
      },
    ];
  });
}

export function phoneCandidates(text: string): PhoneCandidate[] {
  return [...text.matchAll(PHONE)].map((match, index) => ({
    id: `p${index}`,
    text: match[0],
    context: context(text, match.index ?? 0, match[0].length),
  }));
}
