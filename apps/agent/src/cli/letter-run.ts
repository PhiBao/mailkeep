import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadConfig } from '../config.js';
import { openDb } from '../db/db.js';
import { migrate } from '../db/migrate.js';
import { GatewayClient } from '../gateway/client.js';
import { intakeFile } from '../pipeline/intake.js';
import { PipelineQueue } from '../pipeline/queue.js';

function flags(args: string[]): Map<string, string> {
  const result = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) continue;
    const value = args[index + 1];
    if (value) {
      result.set(argument.slice(2), value);
      index += 1;
    }
  }
  return result;
}

const args = process.argv.slice(2);
const file = args.find((argument) => !argument.startsWith('--'));
const options = flags(args);
if (!file) throw new Error('Usage: letter-run <file> --household <id> [--received <iso>]');
const householdId = options.get('household');
if (!householdId) throw new Error('Missing --household');

const config = loadConfig();
const db = openDb(path.join(config.MAILKEEP_DATA_DIR, 'mailkeep.db'));
migrate(db);
const client = new GatewayClient({ config });
try {
  const intake = await intakeFile({
    bytes: await readFile(file),
    householdId,
    dataDir: config.MAILKEEP_DATA_DIR,
    db,
  });
  if (!intake.duplicate) {
    const received = options.get('received') ?? new Date().toISOString();
    const receivedAt = received.includes('T') ? received : `${received}T12:00:00.000Z`;
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO letters
        (id, household_id, source, trial, received_at, status, mime, sha256, local_path, created_at, updated_at)
       VALUES (?, ?, 'upload', 0, ?, 'queued', ?, ?, ?, ?, ?)`,
    ).run(
      intake.letterId,
      householdId,
      receivedAt,
      intake.mime,
      intake.sha256,
      intake.localPath,
      now,
      now,
    );
  }
  const queue = new PipelineQueue({ client, config, db });
  await queue.enqueue(intake.letterId);
  const row = db
    .prepare(
      'SELECT id, status, lane, kind, amount_cents, due_date, case_id, error FROM letters WHERE id = ?',
    )
    .get(intake.letterId);
  console.log(JSON.stringify(row, null, 2));
} finally {
  db.close();
}
