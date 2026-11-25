import { execFile } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadConfig } from '../apps/agent/src/config.js';
import { openDb } from '../apps/agent/src/db/db.js';
import { migrate } from '../apps/agent/src/db/migrate.js';
import { GatewayClient } from '../apps/agent/src/gateway/client.js';
import { intakeFile } from '../apps/agent/src/pipeline/intake.js';
import { runLetter } from '../apps/agent/src/pipeline/run.js';
import { deleteNamespace } from '../apps/agent/src/providers/pinecone.js';
import { todayIso } from '../apps/agent/src/util/clock.js';

const exec = promisify(execFile);
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HOUSEHOLD_ID = 'hh_demo';
const PARENT_EMAIL = 'ruth@example.invalid';
const FAMILY_EMAIL = 'family@example.invalid';
const DEMO_TODAY = '2026-12-09';

interface SeedMeta {
  id: string;
  received: string;
  photo: string;
  demo: string;
  heldout: boolean;
}

function flags(args: string[]): { values: Map<string, string>; booleans: Set<string> } {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) continue;
    const key = argument.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      values.set(key, next);
      index += 1;
    } else booleans.add(key);
  }
  return { values, booleans };
}

async function admin(...args: string[]): Promise<void> {
  await exec(process.execPath, [path.join(ROOT, 'apps/agent/dist/cli/admin.js'), ...args], {
    cwd: ROOT,
  });
}

function offsetFor(date: string, timezone: string): number {
  const base = todayIso({ clock_offset_days: 0, timezone });
  return Math.round(
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(`${base}T00:00:00Z`)) / 86_400_000,
  );
}

const { values, booleans } = flags(process.argv.slice(2));
const reset = booleans.has('reset');
const boxLink = values.get('box-link');
const config = loadConfig();
const db = openDb(path.join(config.MAILKEEP_DATA_DIR, 'mailkeep.db'));
const client = new GatewayClient({ config });

try {
  migrate(db);
  const existing = db.prepare('SELECT * FROM households WHERE id = ?').get(HOUSEHOLD_ID) as
    | Record<string, unknown>
    | undefined;
  const letterCount = existing
    ? (
        db
          .prepare('SELECT count(*) AS n FROM letters WHERE household_id = ?')
          .get(HOUSEHOLD_ID) as { n: number }
      ).n
    : 0;
  if (letterCount > 0 && !reset) {
    throw new Error('hh_demo already has letters. Re-run with --reset to rebuild it.');
  }

  let generation = Number(
    (
      db.prepare("SELECT v FROM kv WHERE k = 'demo_seed_generation'").get() as
        | { v: string }
        | undefined
    )?.v ?? 0,
  );
  if (reset && existing) {
    const namespace = String(existing.pinecone_namespace ?? HOUSEHOLD_ID);
    await deleteNamespace(client, { index: config.MAILKEEP_PINECONE_INDEX, namespace });
    db.transaction(() => {
      db.prepare('DELETE FROM outbox WHERE household_id = ?').run(HOUSEHOLD_ID);
      db.prepare('DELETE FROM asks WHERE household_id = ?').run(HOUSEHOLD_ID);
      db.prepare('DELETE FROM case_events WHERE household_id = ?').run(HOUSEHOLD_ID);
      db.prepare('DELETE FROM relations WHERE household_id = ?').run(HOUSEHOLD_ID);
      db.prepare('DELETE FROM decisions WHERE household_id = ?').run(HOUSEHOLD_ID);
      db.prepare('DELETE FROM checks WHERE household_id = ?').run(HOUSEHOLD_ID);
      const letterIds = db
        .prepare('SELECT id FROM letters WHERE household_id = ?')
        .all(HOUSEHOLD_ID) as Array<{ id: string }>;
      for (const letter of letterIds) {
        db.prepare('DELETE FROM kv WHERE k IN (?, ?)').run(
          `route:${letter.id}`,
          `acted:${letter.id}`,
        );
      }
      db.prepare('DELETE FROM letters WHERE household_id = ?').run(HOUSEHOLD_ID);
      db.prepare('DELETE FROM cases WHERE household_id = ?').run(HOUSEHOLD_ID);
      const memberIds = db
        .prepare('SELECT id FROM members WHERE household_id = ?')
        .all(HOUSEHOLD_ID) as Array<{ id: string }>;
      for (const member of memberIds) {
        db.prepare('DELETE FROM sessions WHERE member_id = ?').run(member.id);
        db.prepare('DELETE FROM login_tokens WHERE member_id = ?').run(member.id);
      }
      db.prepare('DELETE FROM members WHERE household_id = ?').run(HOUSEHOLD_ID);
      db.prepare('DELETE FROM households WHERE id = ?').run(HOUSEHOLD_ID);
      db.prepare("DELETE FROM kv WHERE k LIKE 'digest:hh_demo:%'").run();
    })();
    await rm(path.join(config.MAILKEEP_DATA_DIR, 'originals', HOUSEHOLD_ID), {
      recursive: true,
      force: true,
    });
    generation += 1;
  }

  if (!existing || reset) {
    const name = generation > 0 ? `Ruth's mail (demo ${generation})` : "Ruth's mail";
    await admin(
      'household:create',
      '--id',
      HOUSEHOLD_ID,
      '--name',
      name,
      '--parent-display',
      'Ruth',
      '--tz',
      'America/Chicago',
      '--demo',
    );
  }
  const members = db
    .prepare('SELECT email FROM members WHERE household_id = ?')
    .all(HOUSEHOLD_ID) as Array<{ email: string }>;
  if (!members.some((member) => member.email === PARENT_EMAIL)) {
    await admin(
      'member:add',
      '--household',
      HOUSEHOLD_ID,
      '--email',
      PARENT_EMAIL,
      '--name',
      'Ruth',
      '--role',
      'parent',
    );
  }
  if (!members.some((member) => member.email === FAMILY_EMAIL)) {
    await admin(
      'member:add',
      '--household',
      HOUSEHOLD_ID,
      '--email',
      FAMILY_EMAIL,
      '--name',
      'Sarah',
      '--role',
      'family',
    );
  }
  const parent = db
    .prepare("SELECT id FROM members WHERE household_id = ? AND role = 'parent'")
    .get(HOUSEHOLD_ID) as { id: string };
  db.prepare(
    "INSERT INTO kv (k, v) VALUES ('demo_seed_generation', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
  ).run(String(generation));

  const truth = JSON.parse(await readFile(path.join(ROOT, 'testset/truth.json'), 'utf8')) as Record<
    string,
    SeedMeta
  >;
  const letters = Object.values(truth)
    .filter((letter) => letter.demo === 'seed' && !letter.heldout)
    .sort((left, right) => left.received.localeCompare(right.received));
  if (letters.length < 15)
    throw new Error(`Expected at least 15 demo seed letters, found ${letters.length}`);

  for (const letter of letters) {
    const extension = letter.photo === 'pdf' ? 'pdf' : 'jpg';
    const bytes = await readFile(path.join(ROOT, 'testset/out', `${letter.id}.${extension}`));
    const intake = await intakeFile({
      bytes,
      householdId: HOUSEHOLD_ID,
      dataDir: config.MAILKEEP_DATA_DIR,
      db,
    });
    if (intake.duplicate) continue;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO letters
        (id, household_id, source, trial, submitted_by, received_at, status, mime, sha256, local_path, created_at, updated_at)
       VALUES (?, ?, 'seed', 0, ?, ?, 'queued', ?, ?, ?, ?, ?)`,
    ).run(
      intake.letterId,
      HOUSEHOLD_ID,
      parent.id,
      `${letter.received}T12:00:00.000Z`,
      intake.mime,
      intake.sha256,
      intake.localPath,
      now,
      now,
    );
    db.prepare('UPDATE households SET clock_offset_days = ? WHERE id = ?').run(
      offsetFor(letter.received, 'America/Chicago'),
      HOUSEHOLD_ID,
    );
    await runLetter({ client, config, db }, intake.letterId);
    const row = db
      .prepare('SELECT lane, kind, case_id FROM letters WHERE id = ?')
      .get(intake.letterId) as {
      lane: string | null;
      kind: string | null;
      case_id: string | null;
    };
    console.log(`${letter.id}: ${row.lane ?? 'no lane'} ${row.kind ?? ''}`);
  }

  db.prepare('UPDATE households SET clock_offset_days = ? WHERE id = ?').run(
    offsetFor(DEMO_TODAY, 'America/Chicago'),
    HOUSEHOLD_ID,
  );
  if (boxLink) {
    const url = new URL(boxLink);
    if (url.hostname !== 'app.box.com') throw new Error('Box link must be an app.box.com URL.');
    db.prepare(
      "INSERT INTO kv (k, v) VALUES ('demo_box_link', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    ).run(boxLink);
  }

  const summary = {
    generation,
    letters: letters.length,
    handledOrHeadsup: (
      db
        .prepare(
          "SELECT count(*) AS n FROM letters WHERE household_id = ? AND lane IN ('handled','headsup')",
        )
        .get(HOUSEHOLD_ID) as { n: number }
    ).n,
    openCases: db
      .prepare(
        "SELECT counterparty, title, status, box_folder_id FROM cases WHERE household_id = ? AND status = 'open' ORDER BY counterparty",
      )
      .all(HOUSEHOLD_ID) as Array<Record<string, unknown>>,
    boxRootFolderId: (
      db.prepare('SELECT box_root_folder_id FROM households WHERE id = ?').get(HOUSEHOLD_ID) as {
        box_root_folder_id: string | null;
      }
    ).box_root_folder_id,
    boxLink: boxLink ?? null,
  };
  if (summary.handledOrHeadsup < 15)
    throw new Error('Demo has fewer than 15 handled/headsup letters.');
  for (const counterparty of [
    'Riverbend Water Utility',
    'Harbor County Treasurer',
    'Lakeshore Mutual Insurance',
    'Westmark State Motor Vehicle Division',
    'Northgate Medical Group',
    'Harbor Gas & Electric',
  ]) {
    if (
      !summary.openCases.some((row) => {
        const actual = String(row.counterparty);
        return actual.includes(counterparty) || counterparty.includes(actual);
      })
    ) {
      throw new Error(`Demo is missing an open case for ${counterparty}`);
    }
  }
  await mkdir(path.join(ROOT, 'eval'), { recursive: true });
  await writeFile(path.join(ROOT, 'eval/demo-seed.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
} finally {
  db.close();
}
