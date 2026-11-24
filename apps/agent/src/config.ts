import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  MAILKEEP_PUBLIC_URL: z.string().default(''),
  MAILKEEP_DATA_DIR: z.string().default('/home/sprite/mailkeep-data'),
  MAILKEEP_AGENTMAIL_INBOX_ID: z.string().default(''),
  MAILKEEP_PINECONE_INDEX: z.string().default('mailkeep-letters'),
  MAILKEEP_JEV_MODEL: z.string().default('jev-1.14.0'),
  MAILKEEP_OLLAMA_MODEL: z.string().default('gemma4:31b'),
  MAILKEEP_DEMO_HOUSEHOLD_ID: z.string().default('hh_demo'),
  MAILKEEP_TICK_MIN_INTERVAL_S: z.coerce.number().int().min(1).default(300),
  MAILKEEP_GIT_SHA: z.string().default(''),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  GW_BASE_TYPESAFE: z.string().optional(),
  GW_BASE_OLLAMA: z.string().optional(),
  GW_BASE_PINECONE: z.string().optional(),
  GW_BASE_BOX: z.string().optional(),
  GW_BASE_AGENTMAIL: z.string().optional(),
});

export type Config = z.infer<typeof envSchema> & { gitSha: string };

function checkedOutSha(): string {
  try {
    const gitDir = path.join(process.cwd(), '.git');
    const head = readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/i.test(head)) return head;
    if (head.startsWith('ref: ')) {
      const ref = readFileSync(path.join(gitDir, head.slice(5)), 'utf8').trim();
      if (/^[0-9a-f]{40}$/i.test(ref)) return ref;
    }
  } catch {
    return 'dev';
  }
  return 'dev';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.parse(env);
  return { ...parsed, gitSha: parsed.MAILKEEP_GIT_SHA || checkedOutSha() };
}
