import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../apps/agent/src/config.js';
import { openDb } from '../apps/agent/src/db/db.js';
import { migrate } from '../apps/agent/src/db/migrate.js';
import { createHousehold } from '../apps/agent/src/db/repo.js';
import { GatewayClient } from '../apps/agent/src/gateway/client.js';
import { intakeFile } from '../apps/agent/src/pipeline/intake.js';
import { runLetter } from '../apps/agent/src/pipeline/run.js';
import { deleteNamespace } from '../apps/agent/src/providers/pinecone.js';
import { todayIso } from '../apps/agent/src/util/clock.js';
import { T } from '../packages/shared/src/thresholds.js';
import {
  computeMetrics,
  type EvalLetterResult,
  type LetterTruth,
  renderEvalMarkdown,
} from './report.js';
import { selectEvalLetters } from './select.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const heldout = process.argv.includes('--heldout');
const runId = `${heldout ? 'heldout' : 'eval'}-${new Date().toISOString().replace(/[-:.TZ]/g, '')}`;
const householdId = `hh_eval_${runId}`;
const namespace = `eval-${runId}`;
const truth = JSON.parse(await readFile(path.join(ROOT, 'testset/truth.json'), 'utf8')) as Record<
  string,
  { id: string; received: string; photo: string; heldout: boolean; truth: LetterTruth }
>;
const { letters, evaluatedIds, historyIds } = selectEvalLetters(Object.values(truth), heldout);

const config = loadConfig();
const db = openDb(path.join(config.MAILKEEP_DATA_DIR, 'mailkeep.db'));
migrate(db);
const client = new GatewayClient({ config });
createHousehold(db, {
  id: householdId,
  name: `Eval ${runId}`,
  parentDisplay: 'Ruth',
  timezone: 'America/Chicago',
  demo: false,
  pineconeNamespace: namespace,
});

const idMap = new Map<string, string>();
const results: EvalLetterResult[] = [];

try {
  for (const letter of letters) {
    const baseToday = todayIso({ clock_offset_days: 0, timezone: 'America/Chicago' });
    const offset = Math.round(
      (Date.parse(`${letter.received}T00:00:00Z`) - Date.parse(`${baseToday}T00:00:00Z`)) /
        86_400_000,
    );
    db.prepare('UPDATE households SET clock_offset_days = ? WHERE id = ?').run(offset, householdId);
    const extension = letter.photo === 'pdf' ? 'pdf' : 'jpg';
    const bytes = await readFile(path.join(ROOT, 'testset/out', `${letter.id}.${extension}`));
    const intake = await intakeFile({ bytes, householdId, dataDir: config.MAILKEEP_DATA_DIR, db });
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO letters
        (id, household_id, source, trial, received_at, status, mime, sha256, local_path, created_at, updated_at)
       VALUES (?, ?, 'eval', 1, ?, 'queued', ?, ?, ?, ?, ?)`,
    ).run(
      intake.letterId,
      householdId,
      `${letter.received}T12:00:00.000Z`,
      intake.mime,
      intake.sha256,
      intake.localPath,
      now,
      now,
    );
    idMap.set(intake.letterId, letter.id);

    try {
      await runLetter({ client, config, db }, intake.letterId, { box: false, email: false });
    } catch (error) {
      console.error(
        `${letter.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    const row = db.prepare('SELECT * FROM letters WHERE id = ?').get(intake.letterId) as Record<
      string,
      unknown
    >;
    if (!evaluatedIds.has(letter.id)) {
      if (row.status !== 'done') throw new Error(`Held-out history ${letter.id} did not finish`);
      console.log(`${letter.id}: history ready`);
      continue;
    }
    const relationRows = db
      .prepare('SELECT other_letter_id, relation FROM relations WHERE letter_id = ?')
      .all(intake.letterId) as Array<{ other_letter_id: string; relation: string }>;
    const askRows = db
      .prepare('SELECT qtype FROM asks WHERE letter_id = ?')
      .all(intake.letterId) as Array<{ qtype: string }>;
    const decision = db
      .prepare('SELECT latency_ms FROM decisions WHERE letter_id = ?')
      .get(intake.letterId) as { latency_ms: number } | undefined;
    results.push({
      id: letter.id,
      letterId: intake.letterId,
      truth: letter.truth,
      lane: row.lane as string | null,
      kind: row.kind as string | null,
      amountCents: row.amount_cents as number | null,
      dueDate: row.due_date as string | null,
      relations: relationRows.flatMap((relation) => {
        const to = idMap.get(relation.other_letter_id);
        return to ? [{ to, relation: relation.relation }] : [];
      }),
      asks: askRows.map((ask) => ask.qtype),
      status: String(row.status),
      error: row.error as string | null,
      costMicrousd: Number(row.cost_microusd ?? 0),
      latencyMs: decision?.latency_ms ?? 0,
    });
    console.log(`${letter.id}: ${row.status} ${row.lane ?? ''}`);
  }
} finally {
  await deleteNamespace(client, { index: config.MAILKEEP_PINECONE_INDEX, namespace });
  db.close();
}

const metrics = computeMetrics(results);
const generatedAt = new Date().toISOString();
const payload = {
  runId,
  generatedAt,
  heldout,
  historyLetterIds: [...historyIds],
  metrics,
  results,
};
await mkdir(path.join(ROOT, 'eval/results'), { recursive: true });
await writeFile(
  path.join(ROOT, 'eval/results', `${runId}.json`),
  `${JSON.stringify(payload, null, 2)}\n`,
);
const previousMarkdown = heldout
  ? await readFile(path.join(ROOT, 'EVAL.md'), 'utf8').catch(() => undefined)
  : undefined;
await writeFile(
  path.join(ROOT, 'EVAL.md'),
  renderEvalMarkdown({
    runId,
    generatedAt,
    heldout,
    metrics,
    results,
    modelIds: [config.MAILKEEP_JEV_MODEL, config.MAILKEEP_OLLAMA_MODEL],
    thresholdsVersion: T.thresholdsVersion,
    previousMarkdown,
  }),
);
console.log(JSON.stringify(metrics, null, 2));
