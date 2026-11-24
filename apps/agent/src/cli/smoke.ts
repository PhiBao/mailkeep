import { readFile } from 'node:fs/promises';
import { loadConfig } from '../config.js';
import { GatewayClient } from '../gateway/client.js';
import { readLetterImage } from '../pipeline/read.js';
import { listInboxes } from '../providers/agentmail.js';
import { getMe } from '../providers/box.js';
import { listModels as listOllamaModels } from '../providers/ollama.js';
import { listIndexes } from '../providers/pinecone.js';
import { listModels as listTypeSafeModels } from '../providers/typesafe.js';

const [command, file] = process.argv.slice(2);
const config = loadConfig();
const client = new GatewayClient({ config });

if (command === 'read') {
  if (!file) throw new Error('Usage: smoke read <image-path>');
  const result = await readLetterImage(client, {
    bytes: await readFile(file),
    model: config.MAILKEEP_OLLAMA_MODEL,
    today: new Date().toISOString().slice(0, 10),
  });
  console.log(
    JSON.stringify(
      {
        title: result.title,
        summary: result.summaryParent,
        amounts: result.amounts.map((item) => item.text),
        dates: result.dates.map((item) => item.iso),
        phones: result.phones.map((item) => item.text),
        needsRetake: result.needsRetake,
        r2Failed: result.r2Failed,
      },
      null,
      2,
    ),
  );
} else {
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
}
