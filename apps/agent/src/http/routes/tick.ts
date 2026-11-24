import { Hono } from 'hono';
import type { TickDeps } from '../../chase/tick.js';
import { runTick } from '../../chase/tick.js';
import { log } from '../../util/log.js';

let running = false;

export function tickRoutes(deps: TickDeps): Hono {
  const app = new Hono();
  app.post('/tick', (context) => {
    if (!running) {
      running = true;
      void runTick(deps)
        .catch((error: unknown) => {
          log.error(
            { event: 'tick_failed' },
            error instanceof Error ? error.message : String(error),
          );
        })
        .finally(() => {
          running = false;
        });
    }
    return context.json({ accepted: true }, 202);
  });
  return app;
}
