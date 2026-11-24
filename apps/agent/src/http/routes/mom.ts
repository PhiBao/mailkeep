import { Hono } from 'hono';
import type { DB } from '../../db/db.js';
import { log } from '../../util/log.js';
import { type Clock, requireMember } from '../session.js';
import { buildTodayDTO } from './api.js';

export interface MomDeps {
  db: DB;
  now?: Clock | undefined;
}

/** Parent-facing, read-only alias of the family Today feed. */
export function momRoutes(deps: MomDeps): Hono {
  const app = new Hono();
  const clock = deps.now ?? (() => new Date());

  app.use('*', async (context, next) => {
    await next();
    if (!context.res.headers.has('Cache-Control')) context.header('Cache-Control', 'no-store');
  });
  app.onError((error, context) => {
    log.error({ event: 'mom_api_error' }, error instanceof Error ? error.message : String(error));
    return context.json({ error: 'internal' }, 500);
  });
  app.get('/api/mom', requireMember(deps.db, clock), (context) => {
    const today = buildTodayDTO(deps.db, context.get('member'), clock);
    return today ? context.json(today) : context.json({ error: 'not_found' }, 404);
  });

  return app;
}
