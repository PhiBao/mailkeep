import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { serve } from '@hono/node-server';
import { loadConfig } from './config.js';
import { openDb } from './db/db.js';
import { migrate } from './db/migrate.js';
import { GatewayClient } from './gateway/client.js';
import { createApp } from './http/app.js';
import { apiRoutes } from './http/routes/api.js';
import { authRoutes } from './http/routes/auth.js';
import { demoRoutes } from './http/routes/demo.js';
import { hooksRoutes } from './http/routes/hooks.js';
import { momRoutes } from './http/routes/mom.js';
import { proofRoutes } from './http/routes/proof.js';
import { tickRoutes } from './http/routes/tick.js';
import { startSenderWorker } from './notify/sender.js';
import { PipelineQueue, resumePending } from './pipeline/queue.js';
import { scanKeys } from './sprite/keyscan.js';
import { collectProof } from './sprite/proof.js';
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
const client = new GatewayClient({ config });
const proof = await collectProof({ config, db, client, keyscan, env: process.env });
const queue = new PipelineQueue({ client, config, db });
const app = createApp(config, (instance) => {
  instance.route('/', authRoutes({ config, db }));
  instance.route('/', apiRoutes({ config, db, client, queue }));
  instance.route('/', demoRoutes({ config, db, queue }));
  instance.route('/', momRoutes({ db }));
  instance.route('/', proofRoutes({ proof }));
  instance.route('/', tickRoutes({ config, db, client, queue }));
  instance.route('/', hooksRoutes({ config, db, client, queue }));
});

const server = serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  log.info({ event: 'started', port: info.port, sha: config.gitSha }, 'Mailkeep agent started');
});

function shutdown(): void {
  server.close(() => db.close());
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

void resumePending({ client, config, db }, queue).catch((error: unknown) => {
  log.error({ event: 'resume_failed' }, error instanceof Error ? error.message : String(error));
});
startSenderWorker({ db, client, config, inboxId: config.MAILKEEP_AGENTMAIL_INBOX_ID });
