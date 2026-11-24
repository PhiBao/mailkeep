import { readFile } from 'node:fs/promises';
import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import type { RouteCheck, RouteOutput } from '../pipeline/route.js';
import { createFolder, listItems, uploadFile, uploadNewVersion } from '../providers/box.js';
import { renderCaseFile, renderLetterFile } from './casefile.js';

interface Household {
  id: string;
  name: string;
  box_root_folder_id: string | null;
  box_cases_folder_id: string | null;
  box_other_folder_id: string | null;
  box_careful_folder_id: string | null;
  box_trials_folder_id: string | null;
}

interface LetterRow {
  id: string;
  title: string | null;
  received_at: string;
  local_path: string;
  mime: string;
  summary_parent: string | null;
  todo_parent: string | null;
  transcript: string | null;
  lane: string | null;
  box_file_id: string | null;
  trial: number;
}

function safeName(value: string): string {
  return value
    .replace(/\$[\d,]+(?:\.\d{2})?/g, '')
    .replace(/\b\d{6,}\b/g, '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

async function ensureFolder(
  client: GatewayClient,
  parentId: string,
  name: string,
): Promise<string> {
  const items = await listItems(client, parentId);
  const existing = items.entries.find((entry) => entry.type === 'folder' && entry.name === name);
  return existing?.id ?? (await createFolder(client, { parentId, name })).id;
}

export async function ensureHouseholdFolders(
  client: GatewayClient,
  db: DB,
  householdId: string,
): Promise<Household> {
  const household = db
    .prepare('SELECT * FROM households WHERE id = ?')
    .get(householdId) as Household;
  const mailkeep = await ensureFolder(client, '0', 'Mailkeep');
  const root =
    household.box_root_folder_id ?? (await ensureFolder(client, mailkeep, household.name));
  const cases = household.box_cases_folder_id ?? (await ensureFolder(client, root, 'Cases'));
  const other = household.box_other_folder_id ?? (await ensureFolder(client, root, 'Other mail'));
  const careful = household.box_careful_folder_id ?? (await ensureFolder(client, root, 'Careful'));
  const trials = household.box_trials_folder_id ?? (await ensureFolder(client, root, 'Trials'));
  db.prepare(
    `UPDATE households SET box_root_folder_id = ?, box_cases_folder_id = ?, box_other_folder_id = ?,
      box_careful_folder_id = ?, box_trials_folder_id = ? WHERE id = ?`,
  ).run(root, cases, other, careful, trials, householdId);
  return {
    ...household,
    box_root_folder_id: root,
    box_cases_folder_id: cases,
    box_other_folder_id: other,
    box_careful_folder_id: careful,
    box_trials_folder_id: trials,
  };
}

async function putFile(
  client: GatewayClient,
  input: { folderId: string; name: string; bytes: Buffer; contentType: string },
): Promise<string> {
  const items = await listItems(client, input.folderId);
  const existing = items.entries.find(
    (entry) => entry.type === 'file' && entry.name === input.name,
  );
  if (existing) {
    await uploadNewVersion(client, {
      fileId: existing.id,
      name: input.name,
      bytes: input.bytes,
      contentType: input.contentType,
    });
    return existing.id;
  }
  return (await uploadFile(client, input)).entries[0]?.id ?? '';
}

export async function updateCaseFile(
  client: GatewayClient,
  db: DB,
  input: { householdId: string; caseId: string; modelIds: string[] },
): Promise<void> {
  const household = await ensureHouseholdFolders(client, db, input.householdId);
  const caseRow = db
    .prepare('SELECT * FROM cases WHERE id = ? AND household_id = ?')
    .get(input.caseId, input.householdId) as Record<string, unknown> | undefined;
  if (!caseRow) throw new Error(`Case ${input.caseId} not found`);
  let folderId = caseRow.box_folder_id ? String(caseRow.box_folder_id) : '';
  if (!folderId) {
    const firstLetter = db
      .prepare(
        'SELECT received_at FROM letters WHERE case_id = ? AND household_id = ? ORDER BY received_at LIMIT 1',
      )
      .get(input.caseId, input.householdId) as { received_at: string } | undefined;
    const date = (firstLetter?.received_at ?? new Date().toISOString()).slice(0, 10);
    const folderName = safeName(
      `${date.slice(0, 7)} ${String(caseRow.counterparty)} — ${String(caseRow.title)} (${input.caseId})`,
    );
    folderId = await ensureFolder(client, household.box_cases_folder_id ?? '', folderName);
    db.prepare('UPDATE cases SET box_folder_id = ? WHERE id = ? AND household_id = ?').run(
      folderId,
      input.caseId,
      input.householdId,
    );
  }
  const events = db
    .prepare(
      'SELECT created_at, type, actor FROM case_events WHERE case_id = ? AND household_id = ? ORDER BY created_at',
    )
    .all(input.caseId, input.householdId) as Array<{
    created_at: string;
    type: string;
    actor: string;
  }>;
  const letters = db
    .prepare('SELECT id FROM letters WHERE case_id = ? AND household_id = ? ORDER BY received_at')
    .all(input.caseId, input.householdId) as Array<{ id: string }>;
  const markdown = renderCaseFile({
    title: String(caseRow.title),
    counterparty: String(caseRow.counterparty),
    kind: String(caseRow.kind),
    status: String(caseRow.status),
    amountCents: caseRow.amount_cents === null ? null : Number(caseRow.amount_cents),
    dueDate: caseRow.due_date === null ? null : String(caseRow.due_date),
    secondNotice: Boolean(caseRow.second_notice),
    contradiction: Boolean(caseRow.contradiction),
    events: events.map((event) => ({
      createdAt: event.created_at,
      type: event.type,
      actor: event.actor,
    })),
    letterIds: letters.map((letter) => letter.id),
    modelIds: input.modelIds,
    updatedAt: new Date().toISOString(),
  });
  const caseFileId = await putFile(client, {
    folderId,
    name: 'case.md',
    bytes: Buffer.from(markdown),
    contentType: 'text/markdown',
  });
  db.prepare('UPDATE cases SET box_casefile_id = ? WHERE id = ? AND household_id = ?').run(
    caseFileId,
    input.caseId,
    input.householdId,
  );
}

export async function fileLetter(
  client: GatewayClient,
  db: DB,
  input: {
    householdId: string;
    letter: LetterRow;
    route: RouteOutput;
    caseId: string | null;
    caseChange: RouteOutput['caseChange'];
    checks: RouteCheck[];
    modelIds: string[];
  },
): Promise<void> {
  const household = await ensureHouseholdFolders(client, db, input.householdId);
  const date = input.letter.received_at.slice(0, 10);
  const title = safeName(input.letter.title || 'Letter');
  let folderId = household.box_other_folder_id ?? '';
  if (input.letter.trial) {
    folderId = await ensureFolder(client, household.box_trials_folder_id ?? '', date);
  } else if (input.route.lane === 'careful') {
    folderId = household.box_careful_folder_id ?? '';
  } else if (input.caseId && input.caseChange) {
    const caseRow = db
      .prepare('SELECT box_folder_id FROM cases WHERE id = ? AND household_id = ?')
      .get(input.caseId, input.householdId) as { box_folder_id: string | null } | undefined;
    if (caseRow?.box_folder_id) {
      folderId = caseRow.box_folder_id;
    } else {
      const month = date.slice(0, 7);
      const folderName = safeName(
        `${month} ${input.caseChange.counterparty} — ${input.caseChange.title} (${input.caseId})`,
      );
      folderId = await ensureFolder(client, household.box_cases_folder_id ?? '', folderName);
      db.prepare('UPDATE cases SET box_folder_id = ? WHERE id = ? AND household_id = ?').run(
        folderId,
        input.caseId,
        input.householdId,
      );
    }
  } else if (input.route.lane === 'handled') {
    folderId = await ensureFolder(client, household.box_other_folder_id ?? '', date.slice(0, 4));
  }

  const extension = input.letter.mime === 'application/pdf' ? 'pdf' : 'jpg';
  const originalName = `${date} ${title}.${extension}`;
  const originalFileId = await putFile(client, {
    folderId,
    name: originalName,
    bytes: await readFile(input.letter.local_path),
    contentType: input.letter.mime,
  });
  db.prepare('UPDATE letters SET box_file_id = ? WHERE id = ? AND household_id = ?').run(
    originalFileId,
    input.letter.id,
    input.householdId,
  );

  const letterMarkdown = renderLetterFile({
    title: input.letter.title ?? 'Letter',
    receivedAt: input.letter.received_at,
    lane: input.route.lane,
    summaryParent: input.letter.summary_parent ?? '',
    todoParent: input.letter.todo_parent,
    transcript: input.letter.transcript ?? '',
    checks: input.checks,
    modelIds: input.modelIds,
  });
  await putFile(client, {
    folderId,
    name: `${date} ${title}.md`,
    bytes: Buffer.from(letterMarkdown),
    contentType: 'text/markdown',
  });

  if (input.caseId && input.caseChange) {
    const caseRow = db
      .prepare('SELECT * FROM cases WHERE id = ? AND household_id = ?')
      .get(input.caseId, input.householdId) as Record<string, unknown>;
    const events = db
      .prepare(
        'SELECT created_at, type, actor FROM case_events WHERE case_id = ? AND household_id = ? ORDER BY created_at',
      )
      .all(input.caseId, input.householdId) as Array<{
      created_at: string;
      type: string;
      actor: string;
    }>;
    const letters = db
      .prepare('SELECT id FROM letters WHERE case_id = ? AND household_id = ? ORDER BY received_at')
      .all(input.caseId, input.householdId) as Array<{ id: string }>;
    const markdown = renderCaseFile({
      title: String(caseRow.title),
      counterparty: String(caseRow.counterparty),
      kind: String(caseRow.kind),
      status: String(caseRow.status),
      amountCents: caseRow.amount_cents === null ? null : Number(caseRow.amount_cents),
      dueDate: caseRow.due_date === null ? null : String(caseRow.due_date),
      secondNotice: Boolean(caseRow.second_notice),
      contradiction: Boolean(caseRow.contradiction),
      events: events.map((event) => ({
        createdAt: event.created_at,
        type: event.type,
        actor: event.actor,
      })),
      letterIds: letters.map((letter) => letter.id),
      modelIds: input.modelIds,
      updatedAt: new Date().toISOString(),
    });
    const caseFileId = await putFile(client, {
      folderId,
      name: 'case.md',
      bytes: Buffer.from(markdown),
      contentType: 'text/markdown',
    });
    db.prepare('UPDATE cases SET box_casefile_id = ? WHERE id = ? AND household_id = ?').run(
      caseFileId,
      input.caseId,
      input.householdId,
    );
  }
}
