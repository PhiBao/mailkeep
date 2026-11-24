import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { openDb } from './db/db.js';
import { migrate } from './db/migrate.js';
import { GatewayClient } from './gateway/client.js';
import { createApp } from './http/app.js';
import { resumePending } from './pipeline/queue.js';
import { scanKeys } from './sprite/keyscan.js';
import { log } from './util/log.js';

const config = loadConfig();
const keyscan = await scanKeys({
  root: process.cwd(),
  dataDir: config.MAILKEEP_DATA_DIR,
  env: process.env,
});
if (keyscan.found > 0) {
  log.error({ event: 'keyscan_failed', found: keyscan.found }, 'Provider-key pattern found');
  throw new Error(`Keyscan found ${keyscan.found} possible secret location(s)`);
}

await mkdir(config.MAILKEEP_DATA_DIR, { recursive: true, mode: 0o700 });
const db = openDb(path.join(config.MAILKEEP_DATA_DIR, 'mailkeep.db'));
migrate(db);
const app = createApp(config);

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log.info({ event: 'started', port: info.port, sha: config.gitSha }, 'Mailkeep agent started');
});

function shutdown(): void {
  server.close(() => db.close());
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void resumePending({ client: new GatewayClient({ config }), config, db }).catch(
  (error: unknown) => {
    log.error({ event: 'resume_failed' }, error instanceof Error ? error.message : String(error));
  },
);
