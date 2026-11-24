import { execFile } from 'node:child_process';
import type { Dirent } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { hostname as osHostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { type ProofDTO, proofSchema, T } from '@mailkeep/shared';
import { z } from 'zod';
import type { Config } from '../config.js';
import type { DB } from '../db/db.js';
import type { GatewayClient, Provider } from '../gateway/client.js';
import type { KeyscanResult } from './keyscan.js';

const SERVICE_NAME = 'mailkeep';
const SERVICE_TIMEOUT_MS = 5_000;
const CONNECTION_PREFIX_LENGTH = 8;
const DEFAULT_EVAL_DIR = fileURLToPath(new URL('../../../../eval/results/', import.meta.url));

// Keep these estimates in sync with the per-letter calculation in pipeline/run.ts.
const JEV_MICROUSD_PER_TOKEN = 0.042;
const OLLAMA_INPUT_MICROUSD_PER_TOKEN = 0.14;
const OLLAMA_OUTPUT_MICROUSD_PER_TOKEN = 0.4;

const SAFE_ENV_NAME = /^(?:MAILKEEP_[A-Z0-9_]+|GW_BASE_[A-Z0-9_]+|PORT|LOG_LEVEL)$/;

const THRESHOLD_EFFECTS: Record<keyof typeof T, string> = {
  scamAny: 'Any scam signal at or above routes to careful.',
  senderInconsistent:
    'Sender consistency below this on a linked letter flags sender mismatch and routes to careful.',
  linkAccept: 'Same-matter probability at or above links to the past letter’s case.',
  linkAsk:
    'Same-matter probability at or above, but below the accept bar, asks which letter matches.',
  followUp:
    'A linked follow-up at or above marks a second notice or reopens a paid or closed case.',
  completesAccept: 'Completion at or above marks the linked case paid.',
  completesAsk: 'Completion at or above, but below the accept bar, asks whether the bill was paid.',
  kindAccept: 'Kind probability below this asks the family to classify the letter.',
  junk: 'Marketing at or above, with low action need and no amount, files as handled.',
  infoQuiet: 'Quiet informational mail at or above, with low action need, files as handled.',
  needsAction:
    'Action-needed probability at or above opens a needs-you or headsup case for actionable kinds.',
  fieldConfidence: 'Amount or due-date choice confidence at or above uses the selected field.',
  bigAmountCents: 'An amount in cents at or above routes an actionable letter to needs-you.',
  dueSoonDays:
    'A due date this many days away or sooner routes an actionable bill or renewal to needs-you.',
  thresholdsVersion: 'Version of the shared routing thresholds used for this run.',
};

const PRIOR_ART = {
  name: 'pyaroslav/kitchen-table',
  url: 'https://github.com/pyaroslav/kitchen-table',
  difference:
    'Kitchen Table explains one letter locally; Mailkeep tracks household mail over time, links related notices into cases, and follows up.',
} as const;

const evalFileSchema = z
  .object({
    runId: z.string().min(1),
    generatedAt: z.string().datetime({ offset: true }),
    metrics: z.object({
      letters: z.number().int().nonnegative(),
      laneAccuracy: z.number().min(0).max(1),
      unsafe: z.number().int().nonnegative(),
      scamsCaught: z.number().int().nonnegative(),
      scamsTotal: z.number().int().nonnegative(),
      linkPrecision: z.number().min(0).max(1),
      linkRecall: z.number().min(0).max(1),
      askRate: z.number().min(0).max(1),
    }),
  })
  .refine((value) => value.metrics.unsafe <= value.metrics.letters, {
    message: 'Unsafe count exceeds letter count',
  })
  .refine((value) => value.metrics.scamsCaught <= value.metrics.scamsTotal, {
    message: 'Caught scam count exceeds scam total',
  });

export interface ExecFileOptions {
  encoding: 'utf8';
  timeout: number;
  maxBuffer: number;
  shell: false;
}

export type ExecFileRunner = (
  file: string,
  args: readonly string[],
  options: ExecFileOptions,
  callback: (error: Error | null, stdout: string) => void,
) => void;

export interface EvalFile {
  name: string;
  contents: string;
}

export type ServiceListReader = () => Promise<string>;
export type EvalFilesReader = () => Promise<EvalFile[]>;

export interface ProofDeps {
  config: Config;
  db: DB;
  client: Pick<GatewayClient, 'discover'>;
  keyscan: KeyscanResult;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  hostname?: () => string;
  serviceName?: string;
  serviceList?: ServiceListReader;
  evalFiles?: EvalFilesReader;
  evalDir?: string;
}

interface CostRow {
  letters_processed: number;
  total_microusd: number;
  jev_tokens: number;
  ollama_in_tokens: number;
  ollama_out_tokens: number;
}

const defaultExecFile: ExecFileRunner = (file, args, options, callback) => {
  execFile(file, args, options, (error, stdout) => callback(error, stdout));
};

export function readServiceList(exec: ExecFileRunner = defaultExecFile): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      exec(
        'sprite-env',
        ['services', 'list'],
        {
          encoding: 'utf8',
          timeout: SERVICE_TIMEOUT_MS,
          maxBuffer: 1_000_000,
          shell: false,
        },
        (error, stdout) => {
          if (error) reject(error);
          else resolve(stdout);
        },
      );
    } catch (error) {
      reject(error);
    }
  });
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function formatUptime(startedAt: unknown, now: Date): string {
  if (typeof startedAt !== 'string') return 'unavailable';
  const started = Date.parse(startedAt);
  const current = now.getTime();
  if (!Number.isFinite(started) || !Number.isFinite(current) || started > current) {
    return 'unavailable';
  }

  const seconds = Math.floor((current - started) / 1_000);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainingSeconds = seconds % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${remainingSeconds}s`;
  if (minutes > 0) return `${minutes}m ${remainingSeconds}s`;
  return `${remainingSeconds}s`;
}

function parseServiceMetadata(
  payload: unknown,
  serviceName: string,
  now: Date,
): Pick<ProofDTO['where'], 'serviceStatus' | 'uptime'> {
  const container = objectValue(payload);
  const services = Array.isArray(payload)
    ? payload
    : Array.isArray(container?.services)
      ? container.services
      : [];
  const service = services.map(objectValue).find((candidate) => candidate?.name === serviceName);
  if (!service) return { serviceStatus: 'unavailable', uptime: 'unavailable' };

  const state = objectValue(service.state);
  const rawStatus = state?.status;
  const serviceStatus =
    typeof rawStatus === 'string' && /^[a-z][a-z0-9_-]{0,31}$/i.test(rawStatus)
      ? rawStatus
      : 'unknown';
  return { serviceStatus, uptime: formatUptime(state?.started_at, now) };
}

async function collectWhere(deps: ProofDeps, now: Date): Promise<ProofDTO['where']> {
  let spriteName = 'unavailable';
  try {
    spriteName = (deps.hostname ?? osHostname)() || 'unavailable';
  } catch {}

  const where: ProofDTO['where'] = {
    spriteName,
    url: deps.config.MAILKEEP_PUBLIC_URL,
    serviceStatus: 'unavailable',
    gitSha: deps.config.gitSha,
    uptime: 'unavailable',
  };
  try {
    const stdout = await (deps.serviceList ?? readServiceList)();
    Object.assign(
      where,
      parseServiceMetadata(JSON.parse(stdout), deps.serviceName ?? SERVICE_NAME, now),
    );
  } catch {}
  return where;
}

function connectionIdPrefix(base: string): string {
  try {
    const segments = new URL(base).pathname.split('/').filter(Boolean);
    const gatewayIndex = segments.lastIndexOf('gateway');
    const id = gatewayIndex >= 0 ? segments[gatewayIndex + 2] : undefined;
    if (!id || id.length <= CONNECTION_PREFIX_LENGTH) return 'unavailable';
    return id.slice(0, CONNECTION_PREFIX_LENGTH);
  } catch {
    return 'unavailable';
  }
}

async function collectConnectors(
  client: Pick<GatewayClient, 'discover'>,
): Promise<ProofDTO['connectors']> {
  let bases: Map<Provider, string>;
  try {
    bases = await client.discover();
  } catch {
    return [];
  }

  return [...bases.entries()]
    .map(([provider, base]) => ({
      provider,
      connectionIdPrefix: typeof base === 'string' ? connectionIdPrefix(base) : 'unavailable',
      credentialLocation: 'Fly connector',
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

async function readEvalFiles(directory: string): Promise<EvalFile[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map(async (entry) => {
        try {
          return {
            name: entry.name,
            contents: await readFile(`${directory}/${entry.name}`, 'utf8'),
          };
        } catch {
          return null;
        }
      }),
  );
  return files.filter((file): file is EvalFile => file !== null);
}

async function collectEval(reader: EvalFilesReader): Promise<ProofDTO['eval']> {
  let files: EvalFile[];
  try {
    files = await reader();
  } catch {
    return null;
  }

  let latest: { time: number; runId: string; summary: ProofDTO['eval'] } | undefined;
  for (const file of files) {
    try {
      const parsed = evalFileSchema.parse(JSON.parse(file.contents));
      const time = Date.parse(parsed.generatedAt);
      if (
        latest &&
        (time < latest.time || (time === latest.time && parsed.runId <= latest.runId))
      ) {
        continue;
      }
      latest = {
        time,
        runId: parsed.runId,
        summary: {
          runId: parsed.runId,
          generatedAt: parsed.generatedAt,
          letters: parsed.metrics.letters,
          laneAccuracy: parsed.metrics.laneAccuracy,
          neverSafe: `${parsed.metrics.letters - parsed.metrics.unsafe}/${parsed.metrics.letters}`,
          scamsCaught: `${parsed.metrics.scamsCaught}/${parsed.metrics.scamsTotal}`,
          linkPrecision: parsed.metrics.linkPrecision,
          linkRecall: parsed.metrics.linkRecall,
          askRate: parsed.metrics.askRate,
        },
      };
    } catch {}
  }
  return latest?.summary ?? null;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function collectCosts(db: DB): ProofDTO['costs'] {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS letters_processed,
              COALESCE(SUM(cost_microusd), 0) AS total_microusd,
              COALESCE(SUM(jev_tokens), 0) AS jev_tokens,
              COALESCE(SUM(ollama_in_tokens), 0) AS ollama_in_tokens,
              COALESCE(SUM(ollama_out_tokens), 0) AS ollama_out_tokens
         FROM letters`,
    )
    .get() as CostRow | undefined;
  const lettersProcessed = nonNegativeInteger(row?.letters_processed);
  const totalMicrousd = nonNegativeInteger(row?.total_microusd);
  const jevMicrousd = Math.round(nonNegativeInteger(row?.jev_tokens) * JEV_MICROUSD_PER_TOKEN);
  const ollamaMicrousd = Math.round(
    nonNegativeInteger(row?.ollama_in_tokens) * OLLAMA_INPUT_MICROUSD_PER_TOKEN +
      nonNegativeInteger(row?.ollama_out_tokens) * OLLAMA_OUTPUT_MICROUSD_PER_TOKEN,
  );
  return {
    lettersProcessed,
    totalMicrousd,
    averageMicrousd: lettersProcessed === 0 ? 0 : Math.round(totalMicrousd / lettersProcessed),
    jevMicrousd,
    ollamaMicrousd,
  };
}

function collectThresholds(): ProofDTO['thresholds'] {
  return (Object.keys(T) as Array<keyof typeof T>).map((key) => ({
    key,
    bar: T[key],
    effect: THRESHOLD_EFFECTS[key],
  }));
}

function collectEnvVarNames(env: NodeJS.ProcessEnv): string[] {
  return Object.keys(env)
    .filter((name) => SAFE_ENV_NAME.test(name))
    .sort();
}

export async function collectProof(deps: ProofDeps): Promise<ProofDTO> {
  const now = deps.now?.() ?? new Date();
  const [where, connectors, evaluation] = await Promise.all([
    collectWhere(deps, now),
    collectConnectors(deps.client),
    collectEval(deps.evalFiles ?? (() => readEvalFiles(deps.evalDir ?? DEFAULT_EVAL_DIR))),
  ]);

  return proofSchema.parse({
    where,
    connectors,
    keyscan: {
      found: deps.keyscan.found,
      checkedAt: deps.keyscan.checkedAt,
      envVarNames: collectEnvVarNames(deps.env ?? process.env),
    },
    thresholds: collectThresholds(),
    eval: evaluation,
    costs: collectCosts(deps.db),
    priorArt: PRIOR_ART,
  });
}
