import type { Kind, Lane } from './types.js';

export const LANE_LABELS: Record<Lane, string> = {
  handled: 'HANDLED',
  headsup: 'HEADS-UP',
  needs_you: 'NEEDS YOU',
  careful: 'CAREFUL',
};

export interface ParentResultInput {
  lane: Lane;
  amountCents?: number | null;
  dueDate?: string | null;
  kind?: Kind | null;
}

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const parentDate = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

export function formatUsd(cents: number): string {
  return money.format(cents / 100);
}

export function formatParentDate(isoDate: string): string {
  return parentDate.format(new Date(`${isoDate}T00:00:00Z`));
}

export function parentResultCopy(input: ParentResultInput): string {
  switch (input.lane) {
    case 'handled':
      return 'Nothing to do. You can put it away.';
    case 'headsup': {
      if (input.amountCents !== null && input.amountCents !== undefined) {
        const amount = formatUsd(input.amountCents);
        return input.dueDate
          ? `Pay ${amount} by ${formatParentDate(input.dueDate)}.`
          : `Pay ${amount}.`;
      }
      if (input.kind === 'renewal' && input.dueDate) {
        return `Renew by ${formatParentDate(input.dueDate)}.`;
      }
      if (input.dueDate) {
        return `Take care of this by ${formatParentDate(input.dueDate)}.`;
      }
      return 'Keep this one for later.';
    }
    case 'needs_you':
      return 'Sarah will look at this one. Keep it for now.';
    case 'careful':
      return "Careful. Don't pay. Don't call the number on it. Sarah has been told.";
  }
}

export function retakeCopy(): string {
  return 'The photo was too dark. Please take another one in good light.';
}

export function parentHeadsupSubject(input: {
  title: string;
  amountCents: number;
  dueDate?: string | null;
}): string {
  return input.dueDate
    ? `${input.title}: pay ${formatUsd(input.amountCents)} by ${formatParentDate(input.dueDate)}`
    : `${input.title}: pay ${formatUsd(input.amountCents)}`;
}

export function parentHandledSubject(input: { title: string }): string {
  return `Nothing to do: ${input.title}`;
}

export function parentNeedsYouSubject(input: { title: string }): string {
  return `Sarah will look at: ${input.title}`;
}

export function parentCarefulSubject(): string {
  return 'Careful: this letter looks like a scam';
}

export function retakeSubject(): string {
  return 'Please take another photo';
}

export function familySecondNoticeSubject(input: { counterparty: string; kind: string }): string {
  return `Second notice: ${input.counterparty} ${input.kind} — nobody marked it paid`;
}

export function familyContradictionSubject(input: { counterparty: string }): string {
  return `Past-due notice for a bill marked paid: ${input.counterparty}`;
}

export function familyCarefulSubject(input: { parentDisplay: string }): string {
  return `Careful: a letter to ${input.parentDisplay} looks like a scam`;
}

export function askSubject(input: { question: string }): string {
  return `Mailkeep needs you: ${input.question}`;
}

export function loginSubject(): string {
  return 'Your Mailkeep sign-in link';
}
