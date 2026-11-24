import { loadConfig } from '../config.js';
import { GatewayClient } from '../gateway/client.js';
import { listInboxes } from '../providers/agentmail.js';
import { getMe } from '../providers/box.js';
import { listModels as listOllamaModels } from '../providers/ollama.js';
import { listIndexes } from '../providers/pinecone.js';
import { listModels as listTypeSafeModels } from '../providers/typesafe.js';

const client = new GatewayClient({ config: loadConfig() });
const checks: Array<[string, () => Promise<unknown>]> = [
  ['typesafe', () => listTypeSafeModels(client)],
  ['ollama', () => listOllamaModels(client)],
  ['pinecone', () => listIndexes(client)],
  ['box', () => getMe(client)],
  ['agentmail', () => listInboxes(client)],
];

const results = await Promise.all(
  checks.map(async ([name, check]) => {
    try {
      await check();
      console.log(`PASS ${name}`);
      return true;
    } catch (error) {
      console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }),
);

if (results.some((passed) => !passed)) process.exitCode = 1;
