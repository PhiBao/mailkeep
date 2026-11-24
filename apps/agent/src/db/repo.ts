import type { MemberRole } from '@mailkeep/shared';
import { id } from '../util/ids.js';
import type { DB } from './db.js';

export interface HouseholdInput {
  id?: string;
  name: string;
  parentDisplay: string;
  timezone: string;
  demo: boolean;
  pineconeNamespace?: string;
}

export function createHousehold(
  db: DB,
  input: HouseholdInput,
): { id: string; name: string; pineconeNamespace: string } {
  const householdId = input.id ?? (input.demo ? 'hh_demo' : id('hh'));
  const pineconeNamespace = input.pineconeNamespace ?? householdId;
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO households
      (id, name, parent_display, is_demo, timezone, pinecone_namespace, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    householdId,
    input.name,
    input.parentDisplay,
    input.demo ? 1 : 0,
    input.timezone,
    pineconeNamespace,
    createdAt,
  );
  return { id: householdId, name: input.name, pineconeNamespace };
}

export function addMember(
  db: DB,
  input: { householdId: string; email: string; displayName: string; role: MemberRole },
): { id: string; email: string } {
  const memberId = id('mem');
  db.prepare(
    `INSERT INTO members (id, household_id, email, display_name, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    memberId,
    input.householdId,
    input.email.toLowerCase(),
    input.displayName,
    input.role,
    new Date().toISOString(),
  );
  return { id: memberId, email: input.email.toLowerCase() };
}

export function getHousehold(db: DB, householdId: string) {
  return db.prepare('SELECT * FROM households WHERE id = ?').get(householdId) as
    | Record<string, unknown>
    | undefined;
}

export function getMemberByEmail(db: DB, email: string) {
  return db.prepare('SELECT * FROM members WHERE email = ?').get(email.toLowerCase()) as
    | Record<string, unknown>
    | undefined;
}
