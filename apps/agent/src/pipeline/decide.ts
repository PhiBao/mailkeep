import { nanoid } from 'nanoid';
import type { DB } from '../db/db.js';
import type { GatewayClient } from '../gateway/client.js';
import { type SystemOneResponse, systemOne } from '../providers/typesafe.js';
import { buildRequest, type QuestionInput } from './questions.js';

export interface DecideResult {
  decisionId: string;
  response: SystemOneResponse;
  latencyMs: number;
}

export async function decide(
  client: GatewayClient,
  db: DB,
  input: QuestionInput & { letterId: string; householdId: string; model: string },
): Promise<DecideResult> {
  const request = buildRequest(input, input.model);
  const started = performance.now();
  const response = await systemOne(client, request);
  const latencyMs = Math.round(performance.now() - started);
  const decisionId = `dec_${nanoid()}`;
  const createdAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO decisions
      (id, letter_id, household_id, model_id, request_json, response_json, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    decisionId,
    input.letterId,
    input.householdId,
    response.model,
    JSON.stringify(request),
    JSON.stringify(response),
    latencyMs,
    createdAt,
  );
  return { decisionId, response, latencyMs };
}
