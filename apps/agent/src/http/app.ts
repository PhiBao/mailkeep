import { Hono } from 'hono';
import type { Config } from '../config.js';
import { securityHeaders } from './headers.js';
import { staticHandler } from './routes/static.js';

export function createApp(config: Config): Hono {
  const app = new Hono();
  app.use('*', securityHeaders);
  app.get('/healthz', (context) => context.json({ ok: true, sha: config.gitSha }));
  app.get('*', staticHandler);
  return app;
}
