import { type ProofDTO, proofSchema } from '@mailkeep/shared';
import { Hono } from 'hono';

export interface ProofRouteDeps {
  proof: ProofDTO;
}

export function proofRoutes(deps: ProofRouteDeps): Hono {
  const app = new Hono();
  const proof = proofSchema.parse(deps.proof);

  app.get('/api/proof', (context) => {
    context.header('Cache-Control', 'no-store');
    return context.json(proof);
  });

  return app;
}
