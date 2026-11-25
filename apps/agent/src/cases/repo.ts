import { nanoid } from 'nanoid';
import type { DB } from '../db/db.js';
import type { CaseChange, RouteRelation } from '../pipeline/route.js';
import { id } from '../util/ids.js';

export function getCase(db: DB, householdId: string, caseId: string) {
  return db
    .prepare('SELECT * FROM cases WHERE household_id = ? AND id = ?')
    .get(householdId, caseId) as Record<string, unknown> | undefined;
}

export function saveCaseChange(
  db: DB,
  input: { householdId: string; letterId: string; change: CaseChange },
): string {
  const existing = input.change.caseId
    ? getCase(db, input.householdId, input.change.caseId)
    : undefined;
  const caseId = existing?.id ? String(existing.id) : id('case');
  const now = new Date().toISOString();
  const amountCents =
    input.change.action === 'paid'
      ? null
      : (input.change.amountCents ??
        (existing?.amount_cents === null || existing?.amount_cents === undefined
          ? null
          : Number(existing.amount_cents)));
  const dueDate =
    input.change.dueDate ??
    (existing?.due_date === null || existing?.due_date === undefined
      ? null
      : String(existing.due_date));
  const accountTail =
    input.change.accountTail ??
    (existing?.account_tail === null || existing?.account_tail === undefined
      ? null
      : String(existing.account_tail));
  const secondNotice = Boolean(existing?.second_notice) || input.change.secondNotice;
  const contradiction = Boolean(existing?.contradiction) || input.change.contradiction;
  if (existing) {
    db.prepare(
      `UPDATE cases SET title = ?, counterparty = ?, account_tail = ?, kind = ?, status = ?, amount_cents = ?,
        due_date = ?, second_notice = ?, contradiction = ?, updated_at = ? WHERE id = ? AND household_id = ?`,
    ).run(
      input.change.title,
      input.change.counterparty,
      accountTail,
      input.change.kind,
      input.change.status,
      amountCents,
      dueDate,
      secondNotice ? 1 : 0,
      contradiction ? 1 : 0,
      now,
      caseId,
      input.householdId,
    );
  } else {
    db.prepare(
      `INSERT INTO cases
        (id, household_id, title, counterparty, account_tail, kind, status, amount_cents, due_date,
         second_notice, contradiction, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      caseId,
      input.householdId,
      input.change.title,
      input.change.counterparty,
      accountTail,
      input.change.kind,
      input.change.status,
      amountCents,
      dueDate,
      secondNotice ? 1 : 0,
      contradiction ? 1 : 0,
      now,
      now,
    );
  }
  return caseId;
}

export function addCaseEvent(
  db: DB,
  input: {
    householdId: string;
    caseId: string;
    letterId?: string | null;
    type: string;
    actor: 'agent' | 'member';
    memberId?: string | null;
    detail?: Record<string, unknown>;
  },
): void {
  db.prepare(
    `INSERT INTO case_events
      (id, household_id, case_id, letter_id, type, actor, member_id, detail_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    `evt_${nanoid()}`,
    input.householdId,
    input.caseId,
    input.letterId ?? null,
    input.type,
    input.actor,
    input.memberId ?? null,
    JSON.stringify(input.detail ?? {}),
    new Date().toISOString(),
  );
}

export function replaceRelations(
  db: DB,
  input: { householdId: string; letterId: string; relations: RouteRelation[] },
): void {
  db.prepare('DELETE FROM relations WHERE household_id = ? AND letter_id = ?').run(
    input.householdId,
    input.letterId,
  );
  saveRelations(db, input);
}

export function saveRelations(
  db: DB,
  input: { householdId: string; letterId: string; relations: RouteRelation[] },
): void {
  for (const relation of input.relations) {
    db.prepare(
      `INSERT INTO relations
        (id, household_id, letter_id, other_letter_id, relation, probability, recall_score, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
    ).run(
      `rel_${nanoid()}`,
      input.householdId,
      input.letterId,
      relation.otherLetterId,
      relation.relation,
      relation.probability,
      relation.status,
      new Date().toISOString(),
    );
  }
}
