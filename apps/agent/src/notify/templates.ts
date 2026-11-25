import {
  askSubject,
  familyCarefulSubject,
  familyContradictionSubject,
  familySecondNoticeSubject,
  formatParentDate,
  formatUsd,
  loginSubject,
  parentCarefulSubject,
  parentHandledSubject,
  parentHeadsupSubject,
  parentNeedsYouSubject,
  retakeSubject,
} from '@mailkeep/shared';
import type { RouteCheck, RouteOutput } from '../pipeline/route.js';

export interface ParentTemplateInput {
  parentDisplay: string;
  title: string;
  senderOrg: string | null;
  summaryParent: string;
  amountCents: number | null;
  dueDate: string | null;
  route: RouteOutput;
}

export function parentNote(input: ParentTemplateInput): { subject: string; body: string } {
  if (input.route.lane === 'careful') {
    return {
      subject: parentCarefulSubject(),
      body: `Hi ${input.parentDisplay}, the letter from "${input.senderOrg ?? 'unknown sender'}" looks like a scam. Don't pay it. Don't call the number on it. Don't give any card or account numbers. Sarah has been told. — Mailkeep`,
    };
  }
  if (input.route.lane === 'handled') {
    return {
      subject: parentHandledSubject({ title: input.title }),
      body: `Hi ${input.parentDisplay}, ${input.summaryParent} Nothing to do. You can put it away. — Mailkeep`,
    };
  }
  if (input.route.lane === 'headsup' && input.amountCents !== null) {
    return {
      subject: parentHeadsupSubject({
        title: input.title,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
      }),
      body: `Hi ${input.parentDisplay}, this is your ${input.senderOrg ?? 'letter'}. Pay ${formatUsd(input.amountCents)}${input.dueDate ? ` by ${formatParentDate(input.dueDate)}` : ''}. Sarah knows about it too. — Mailkeep`,
    };
  }
  return {
    subject: parentNeedsYouSubject({ title: input.title }),
    body: `Hi ${input.parentDisplay}, ${input.summaryParent} Keep it for now. Sarah will look at it. — Mailkeep`,
  };
}

export function familyAlert(input: {
  parentDisplay: string;
  title: string;
  route: RouteOutput;
  checks: RouteCheck[];
  link: string;
}): { subject: string; body: string } {
  if (input.route.caseChange?.contradiction) {
    return {
      subject: familyContradictionSubject({ counterparty: input.route.caseChange.counterparty }),
      body: `Past-due notice for a bill marked paid: ${input.route.caseChange.counterparty}.\n${input.link}`,
    };
  }
  if (input.route.caseChange?.secondNotice) {
    return {
      subject: familySecondNoticeSubject({
        counterparty: input.route.caseChange.counterparty,
        kind: input.route.caseChange.kind,
      }),
      body: `${input.route.notes.join(' ')}\nMailkeep linked the letters. ${input.link}`,
    };
  }
  if (input.route.lane === 'careful') {
    const reasons = input.checks
      .filter((check) => check.key.startsWith('scam_') && (check.probability ?? 0) >= 0.5)
      .map((check) => `- ${check.label} (${check.probability?.toFixed(2)})`);
    return {
      subject: familyCarefulSubject({ parentDisplay: input.parentDisplay }),
      body: `A letter to ${input.parentDisplay} looks like a scam.\n${reasons.join('\n')}\n${input.link}`,
    };
  }
  return {
    subject: `Mailkeep needs you: ${input.title}`,
    body: `${input.route.notes.join(' ')}\n${input.link}`,
  };
}

export function askEmail(input: {
  question: string;
  evidence: string;
  options: Array<{ value: string; label: string }>;
  link: string;
}): { subject: string; body: string } {
  const options = input.options.map((option) => option.value.toUpperCase()).join(' · ');
  return {
    subject: askSubject({ question: input.question }),
    body: `${input.question}\n${input.evidence}\nReply with one word: ${options}, or open ${input.link}`,
  };
}

export function loginEmail(link: string): { subject: string; body: string } {
  return {
    subject: loginSubject(),
    body: `This link works once in the next 15 minutes: ${link}. If you didn't ask for it, ignore this email.`,
  };
}

export function retakeEmail(): { subject: string; body: string } {
  return {
    subject: retakeSubject(),
    body: 'The photo was too dark or blurry to read. Please take another one in good light.',
  };
}

export function failureEmail(input: { title: string; error: string }): {
  subject: string;
  body: string;
} {
  return {
    subject: `Mailkeep couldn't finish: ${input.title}`,
    body: `Mailkeep couldn't finish this letter. ${input.error} Sarah will check it.`,
  };
}
