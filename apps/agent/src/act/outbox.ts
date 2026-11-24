import { nanoid } from 'nanoid';
import type { DB } from '../db/db.js';
import { askEmail, familyAlert, parentNote, retakeEmail } from '../notify/templates.js';
import type { RouteCheck, RouteOutput } from '../pipeline/route.js';

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
    checks: RouteCheck[];
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
    const note = parentNote({
      parentDisplay: input.parentDisplay,
      title: input.letter.title,
      senderOrg: input.letter.sender_org,
      summaryParent: input.letter.summary_parent ?? 'Mailkeep read this letter.',
      amountCents: amount,
      dueDate: due,
      route: input.route,
    });
    insert(db, {
      householdId: input.householdId,
      to: parent.email,
      kind: 'parent_note',
      subject: note.subject,
      body: note.body,
      relatedId: input.letter.id,
      suppressedReason: suppressed,
    });
  }

  if (input.route.familyAlert || input.route.lane === 'careful') {
    const alert = familyAlert({
      parentDisplay: input.parentDisplay,
      title: input.letter.title,
      route: input.route,
      checks: input.checks,
      link,
    });
    for (const member of family) {
      insert(db, {
        householdId: input.householdId,
        to: member.email,
        kind: 'family_alert',
        subject: alert.subject,
        body: alert.body,
        relatedId: input.letter.id,
        suppressedReason: suppressed,
      });
    }
  }

  for (const ask of input.asks) {
    const email = askEmail({
      question: ask.question,
      evidence: ask.evidence,
      options: ask.options,
      link,
    });
    for (const member of family) {
      insert(db, {
        householdId: input.householdId,
        to: member.email,
        kind: 'ask',
        subject: email.subject,
        body: email.body,
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
  const email = retakeEmail();
  insert(db, {
    householdId: input.householdId,
    to: input.to,
    kind: 'retake',
    subject: email.subject,
    body: email.body,
    relatedId: input.letterId,
    suppressedReason: input.suppressedReason,
  });
}
