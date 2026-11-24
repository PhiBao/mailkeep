import { readFileSync } from 'node:fs';
import type { DB } from './db.js';

export const SCHEMA_VERSION = 1;

export function migrate(db: DB): void {
  const kvTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'kv'")
    .get();
  const current = kvTable
    ? (db.prepare("SELECT v FROM kv WHERE k = 'schema_version'").get() as { v: string } | undefined)
    : undefined;
  if (current) {
    const version = Number(current.v);
    if (version > SCHEMA_VERSION) {
      throw new Error(`Database schema ${version} is newer than this build (${SCHEMA_VERSION})`);
    }
    if (version === SCHEMA_VERSION) return;
  }

  const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
  db.transaction(() => {
    db.exec(schema);
    db.prepare(
      "INSERT INTO kv (k, v) VALUES ('schema_version', ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v",
    ).run(String(SCHEMA_VERSION));
  })();
}
