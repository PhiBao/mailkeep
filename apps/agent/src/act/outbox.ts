import {
  askSubject,
  familyCarefulSubject,
  familyContradictionSubject,
  familySecondNoticeSubject,
  formatParentDate,
  formatUsd,
  parentCarefulSubject,
  parentHandledSubject,
  parentHeadsupSubject,
  parentNeedsYouSubject,
  retakeSubject,
} from '@mailkeep/shared';
import { nanoid } from 'nanoid';
import type { DB } from '../db/db.js';
import type { RouteOutput } from '../pipeline/route.js';

interface Member {
  email: string;
  display_name: string;
  role: 'parent' | 'family';
}

interface Letter {
  id: string;
  title: string;
  summary_parent: string | null;
  todo_parent: string | null;
  sender_org: string | null;
  amount_cents: number | null;
  due_date: string | null;
}

interface AskRow {
  id: string;
  question: string;
  evidence: string;
  options: Array<{ value: string; label: string }>;
}

function cleanSubject(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

function alreadyQueued(
  db: DB,
  householdId: string,
  kind: string,
  to: string,
  relatedId: string,
): boolean {
  return Boolean(
    db
      .prepare(
        'SELECT id FROM outbox WHERE household_id = ? AND kind = ? AND to_email = ? AND related_id = ?',
      )
      .get(householdId, kind, to, relatedId),
  );
}

function insert(
  db: DB,
  input: {
    householdId: string;
    to: string;
    kind: string;
    subject: string;
    body: string;
    relatedId: string;
    suppressedReason: string | null;
  },
): void {
  if (alreadyQueued(db, input.householdId, input.kind, input.to, input.relatedId)) return;
  db.prepare(
    `INSERT INTO outbox
      (id, household_id, to_email, kind, subject, body_text, related_id, status, suppressed_reason, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `out_${nanoid()}`,
    input.householdId,
    input.to,
    input.kind,
    cleanSubject(input.subject),
    input.body,
    input.relatedId,
    input.suppressedReason ? 'suppressed' : 'pending',
    input.suppressedReason,
    new Date().toISOString(),
  );
}

export function queueLetterOutbox(
  db: DB,
  input: {
    householdId: string;
    parentDisplay: string;
    publicUrl: string;
    source: string;
    trial: boolean;
    letter: Letter;
    route: RouteOutput;
    asks: AskRow[];
    members: Member[];
  },
): void {
  const parent = input.members.find((member) => member.role === 'parent');
  const family = input.members.filter((member) => member.role === 'family');
  const suppressed =
    input.trial || input.source === 'seed' || input.source === 'sample'
      ? 'trial'
      : input.source === 'eval'
        ? 'eval'
        : null;
  const amount = input.letter.amount_cents;
  const due = input.letter.due_date;
  const link = `${input.publicUrl.replace(/\/$/, '')}/letters/${input.letter.id}`;

  if (parent) {
    let subject = parentNeedsYouSubject({ title: input.letter.title });
    let body = `Hi ${input.parentDisplay}, ${input.letter.summary_parent ?? 'Mailkeep read this letter.'} Keep it for now. Sarah will look at it. — Mailkeep`;
    if (input.route.lane === 'handled') {
      subject = parentHandledSubject({ title: input.letter.title });
      body = `Hi ${input.parentDisplay}, ${input.letter.summary_parent ?? 'Mailkeep read this letter.'} Nothing to do. You can put it away. — Mailkeep`;
    } else if (input.route.lane === 'headsup') {
      subject =
        amount !== null
          ? parentHeadsupSubject({ title: input.letter.title, amountCents: amount, dueDate: due })
          : parentNeedsYouSubject({ title: input.letter.title });
      body =
        amount !== null
          ? `Hi ${input.parentDisplay}, this is your ${input.letter.sender_org ?? 'letter'}. Pay ${formatUsd(amount)}${due ? ` by ${formatParentDate(due)}` : ''}. Sarah knows about it too. — Mailkeep`
          : body;
    } else if (input.route.lane === 'careful') {
      subject = parentCarefulSubject();
      body = `Hi ${input.parentDisplay}, the letter from "${input.letter.sender_org ?? 'unknown sender'}" looks like a scam. Don't pay it. Don't call the number on it. Don't give any card or account numbers. Sarah has been told. — Mailkeep`;
    }
    insert(db, {
      householdId: input.householdId,
      to: parent.email,
      kind: 'parent_note',
      subject,
      body,
      relatedId: input.letter.id,
      suppressedReason: suppressed,
    });
  }

  if (input.route.familyAlert || input.route.lane === 'careful') {
    const subject = input.route.caseChange?.contradiction
      ? familyContradictionSubject({ counterparty: input.route.caseChange.counterparty })
      : input.route.caseChange?.secondNotice
        ? familySecondNoticeSubject({
            counterparty: input.route.caseChange.counterparty,
            kind: input.route.caseChange.kind,
          })
        : input.route.lane === 'careful'
          ? familyCarefulSubject({ parentDisplay: input.parentDisplay })
          : `Mailkeep needs you: ${input.letter.title}`;
    for (const member of family) {
      insert(db, {
        householdId: input.householdId,
        to: member.email,
        kind: 'family_alert',
        subject,
        body: `${input.route.notes.join(' ')}\n${link}`,
        relatedId: input.letter.id,
        suppressedReason: suppressed,
      });
    }
  }

  for (const ask of input.asks) {
    const options = ask.options.map((option) => option.value.toUpperCase()).join(' · ');
    for (const member of family) {
      insert(db, {
        householdId: input.householdId,
        to: member.email,
        kind: 'ask',
        subject: askSubject({ question: ask.question }),
        body: `${ask.question}\n${ask.evidence}\nReply with one word: ${options}, or open ${link}`,
        relatedId: ask.id,
        suppressedReason: suppressed,
      });
    }
  }
}

export function queueRetake(
  db: DB,
  input: { householdId: string; letterId: string; to: string; suppressedReason: string | null },
): void {
  insert(db, {
    householdId: input.householdId,
    to: input.to,
    kind: 'retake',
    subject: retakeSubject(),
    body: 'The photo was too dark or blurry to read. Please take another one in good light.',
    relatedId: input.letterId,
    suppressedReason: input.suppressedReason,
  });
}
