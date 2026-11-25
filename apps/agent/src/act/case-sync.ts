import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import { log } from '../util/log.js';
import { updateCaseFile } from './box.js';

const activeCaseSyncs = new WeakMap<DB, Promise<void>>();

export async function syncPendingCaseFiles(deps: {
  db: DB;
  client: GatewayClient;
  config: Config;
}): Promise<void> {
  const active = activeCaseSyncs.get(deps.db);
  if (active) return active;
  const sync = syncPendingCaseFilesOnce(deps).finally(() => {
    activeCaseSyncs.delete(deps.db);
  });
  activeCaseSyncs.set(deps.db, sync);
  return sync;
}

async function syncPendingCaseFilesOnce(deps: {
  db: DB;
  client: GatewayClient;
  config: Config;
}): Promise<void> {
  const rows = deps.db
    .prepare("SELECT k FROM kv WHERE k LIKE 'case-sync:%' ORDER BY k LIMIT 20")
    .all() as Array<{ k: string }>;
  for (const row of rows) {
    const [, householdId, caseId] = row.k.split(':');
    if (!householdId || !caseId) continue;
    const caseRow = deps.db
      .prepare('SELECT id FROM cases WHERE id = ? AND household_id = ?')
      .get(caseId, householdId);
    if (!caseRow) {
      deps.db.prepare('DELETE FROM kv WHERE k = ?').run(row.k);
      continue;
    }
    try {
      const models = deps.db
        .prepare(
          `SELECT DISTINCT d.model_id FROM decisions d
             JOIN letters l ON l.id = d.letter_id AND l.household_id = d.household_id
             WHERE l.case_id = ? AND l.household_id = ?`,
        )
        .all(caseId, householdId) as Array<{ model_id: string }>;
      await updateCaseFile(deps.client, deps.db, {
        householdId,
        caseId,
        modelIds: [deps.config.MAILKEEP_OLLAMA_MODEL, ...models.map((model) => model.model_id)],
      });
      deps.db.prepare('DELETE FROM kv WHERE k = ?').run(row.k);
    } catch (error) {
      log.warn(
        { event: 'case_sync_failed', householdId, caseId },
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
