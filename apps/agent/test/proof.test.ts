import { proofSchema, T } from '@mailkeep/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { proofRoutes } from '../src/http/routes/proof.js';
import { collectProof, type EvalFile, readServiceList } from '../src/sprite/proof.js';

const CHECKED_AT = '2026-11-24T09:00:00.000Z';
const NOW = new Date('2026-11-24T11:01:01.000Z');
const databases: DB[] = [];

function testDb(): DB {
  const db = openDb(':memory:');
  migrate(db);
  databases.push(db);
  return db;
}

function addLetter(
  db: DB,
  input: {
    id: string;
    jevTokens: number;
    ollamaInTokens: number;
    ollamaOutTokens: number;
    costMicrousd: number;
  },
): void {
  db.prepare(
    `INSERT INTO letters
       (id, household_id, source, received_at, status, mime, sha256, local_path, transcript,
        jev_tokens, ollama_in_tokens, ollama_out_tokens, cost_microusd, created_at, updated_at)
     VALUES (?, 'hh_proof', 'upload', ?, 'done', 'application/pdf', ?, ?, ?,
             ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.id,
    '2026-11-24T08:00:00.000Z',
    `sha-${input.id}`,
    `/PRIVATE_PATH_MARKER/${input.id}.pdf`,
    'PRIVATE_TRANSCRIPT_MARKER',
    input.jevTokens,
    input.ollamaInTokens,
    input.ollamaOutTokens,
    input.costMicrousd,
    '2026-11-24T08:00:00.000Z',
    '2026-11-24T08:01:00.000Z',
  );
}

interface EvalMetricsFixture {
  letters: number;
  laneAccuracy: number;
  unsafe: number;
  scamsCaught: number;
  scamsTotal: number;
  linkPrecision: number;
  linkRecall: number;
  askRate: number;
}

function evalFile(input: {
  runId: string;
  generatedAt: string;
  heldout: boolean;
  metrics: EvalMetricsFixture;
}): EvalFile {
  return {
    name: `${input.runId}.json`,
    contents: JSON.stringify({
      runId: input.runId,
      generatedAt: input.generatedAt,
      heldout: input.heldout,
      metrics: input.metrics,
      results: [],
    }),
  };
}

afterEach(() => {
  for (const db of databases.splice(0)) db.close();
});

describe('proof collection', () => {
  it('runs sprite-env through execFile without a shell and with a timeout', async () => {
    const stdout = JSON.stringify([
      {
        name: 'mailkeep',
        state: { status: 'running', started_at: '2026-11-24T10:00:00.000Z' },
      },
    ]);
    let command: { file: string; args: readonly string[]; options: unknown } | undefined;

    const result = await readServiceList((file, args, options, callback) => {
      command = { file, args, options };
      callback(null, stdout);
    });

    expect(command).toEqual({
      file: 'sprite-env',
      args: ['services', 'list'],
      options: {
        encoding: 'utf8',
        timeout: 5_000,
        maxBuffer: 1_000_000,
        shell: false,
      },
    });
    expect(result).toBe(stdout);
  });

  it('parses injected service, gateway, eval, clock, and DB data without exposing private data', async () => {
    const db = testDb();
    addLetter(db, {
      id: 'letter-1',
      jevTokens: 1_000,
      ollamaInTokens: 100,
      ollamaOutTokens: 50,
      costMicrousd: 76,
    });
    addLetter(db, {
      id: 'letter-2',
      jevTokens: 500,
      ollamaInTokens: 200,
      ollamaOutTokens: 100,
      costMicrousd: 89,
    });

    const typesafeId = 'connTypesafeFullIdentifier';
    const agentmailId = 'connAgentmailFullIdentifier';
    const env = {
      MAILKEEP_PUBLIC_URL: 'https://mailkeep.example',
      MAILKEEP_GIT_SHA: '0123456789abcdef0123456789abcdef01234567',
      MAILKEEP_DATA_DIR: '/PRIVATE_PATH_MARKER/data',
      GW_BASE_TYPESAFE: `https://api.sprites.dev/v1/gateway/typesafe/${typesafeId}`,
      PORT: '8080',
      LOG_LEVEL: 'debug',
      API_KEY: 'PRIVATE_ENV_VALUE',
    };
    const serviceList = JSON.stringify([
      {
        name: 'other-service',
        cmd: '/PRIVATE_PATH_MARKER/bin',
        args: ['/PRIVATE_PATH_MARKER/argument'],
        state: { status: 'stopped', started_at: '2026-11-23T10:00:00.000Z' },
      },
      {
        name: 'mailkeep',
        cmd: 'node',
        args: ['/PRIVATE_PATH_MARKER/app.js'],
        http_port: 8080,
        state: { status: 'running', started_at: '2026-11-24T10:00:00.000Z' },
      },
    ]);
    const evalFiles = [
      evalFile({
        runId: 'eval-20261124200000000',
        generatedAt: '2026-11-24T20:00:00.000Z',
        heldout: false,
        metrics: {
          letters: 30,
          laneAccuracy: 0.96,
          unsafe: 0,
          scamsCaught: 3,
          scamsTotal: 3,
          linkPrecision: 0.72,
          linkRecall: 0.88,
          askRate: 0.03,
        },
      }),
      evalFile({
        runId: 'heldout-20261124210000000',
        generatedAt: '2026-11-24T21:00:00.000Z',
        heldout: true,
        metrics: {
          letters: 8,
          laneAccuracy: 0.875,
          unsafe: 1,
          scamsCaught: 2,
          scamsTotal: 3,
          linkPrecision: 0.9,
          linkRecall: 0.8,
          askRate: 0.125,
        },
      }),
      evalFile({
        runId: 'heldout-20261124220000000',
        generatedAt: '2026-11-24T22:00:00.000Z',
        heldout: true,
        metrics: {
          letters: 1,
          laneAccuracy: 1,
          unsafe: 2,
          scamsCaught: 0,
          scamsTotal: 0,
          linkPrecision: 1,
          linkRecall: 1,
          askRate: 0,
        },
      }),
      { name: 'broken.json', contents: '{not-json' },
    ];

    const proof = await collectProof({
      config: loadConfig(env),
      db,
      client: {
        discover: async () =>
          new Map([
            ['typesafe', `https://api.sprites.dev/v1/gateway/typesafe/${typesafeId}`],
            ['agentmail', `https://api.sprites.dev/v1/gateway/custom_api/${agentmailId}`],
          ]),
      },
      keyscan: {
        found: 2,
        checkedAt: CHECKED_AT,
        hits: ['/PRIVATE_PATH_MARKER/keyscan.txt', 'env:API_KEY'],
      },
      env,
      now: () => NOW,
      hostname: () => 'sprite-proof',
      serviceList: async () => serviceList,
      evalFiles: async () => evalFiles,
    });

    expect(proof.capturedAt).toBe(NOW.toISOString());
    expect(proof.where).toEqual({
      spriteName: 'sprite-proof',
      url: 'https://mailkeep.example',
      serviceStatus: 'running',
      gitSha: env.MAILKEEP_GIT_SHA,
      uptime: '1h 1m 1s',
    });
    expect(proof.connectors).toEqual([
      {
        provider: 'agentmail',
        connectionIdPrefix: agentmailId.slice(0, 8),
        credentialLocation: 'Fly connector',
      },
      {
        provider: 'typesafe',
        connectionIdPrefix: typesafeId.slice(0, 8),
        credentialLocation: 'Fly connector',
      },
    ]);
    expect(proof.keyscan).toEqual({
      found: 2,
      checkedAt: CHECKED_AT,
      envVarNames: [
        'GW_BASE_TYPESAFE',
        'LOG_LEVEL',
        'MAILKEEP_DATA_DIR',
        'MAILKEEP_GIT_SHA',
        'MAILKEEP_PUBLIC_URL',
        'PORT',
      ],
    });
    expect(proof.thresholds.map((threshold) => threshold.key)).toEqual(Object.keys(T));
    expect(proof.thresholds.every((threshold) => threshold.effect.length > 0)).toBe(true);
    for (const threshold of proof.thresholds) {
      expect(threshold.bar).toBe(T[threshold.key as keyof typeof T]);
    }
    expect(proof.eval).toEqual({
      runId: 'heldout-20261124210000000',
      generatedAt: '2026-11-24T21:00:00.000Z',
      heldout: true,
      letters: 8,
      laneAccuracy: 0.875,
      neverSafe: '7/8',
      falseAlarms: 0,
      scamsCaught: '2/3',
      linkPrecision: 0.9,
      linkRecall: 0.8,
      amountAccuracy: null,
      dueAccuracy: null,
      askRate: 0.125,
      averageLatencyMs: null,
    });
    expect(proof.costs).toEqual({
      lettersProcessed: 2,
      totalMicrousd: 165,
      averageMicrousd: 83,
      jevMicrousd: 63,
      ollamaMicrousd: 102,
    });
    expect(proof.priorArt).toEqual({
      name: 'pyaroslav/kitchen-table',
      url: 'https://github.com/pyaroslav/kitchen-table',
      difference: expect.any(String),
    });
    expect(proof.priorArt.difference).not.toContain('\n');
    expect(proofSchema.safeParse(proof).success).toBe(true);

    const serialized = JSON.stringify(proof);
    expect(serialized).not.toContain(typesafeId);
    expect(serialized).not.toContain(agentmailId);
    expect(serialized).not.toContain('PRIVATE_ENV_VALUE');
    expect(serialized).not.toContain('PRIVATE_PATH_MARKER');
    expect(serialized).not.toContain('PRIVATE_TRANSCRIPT_MARKER');
  });

  it('starts with unavailable service and gateway metadata when those collectors fail', async () => {
    const db = testDb();
    const proof = await collectProof({
      config: loadConfig({ MAILKEEP_PUBLIC_URL: '', MAILKEEP_GIT_SHA: 'dev' }),
      db,
      client: {
        discover: async () => {
          throw new Error('PRIVATE_ENV_VALUE connTypesafeFullIdentifier');
        },
      },
      keyscan: {
        found: 0,
        checkedAt: CHECKED_AT,
        hits: ['/PRIVATE_PATH_MARKER/keyscan.txt'],
      },
      env: { API_KEY: 'PRIVATE_ENV_VALUE' },
      now: () => NOW,
      hostname: () => 'sprite-proof',
      serviceList: async () => {
        throw new Error('/PRIVATE_PATH_MARKER/sprite-env');
      },
      evalFiles: async () => {
        throw new Error('/PRIVATE_PATH_MARKER/eval');
      },
    });

    expect(proof.where.serviceStatus).toBe('unavailable');
    expect(proof.where.uptime).toBe('unavailable');
    expect(proof.connectors).toEqual([]);
    expect(proof.eval).toBeNull();
    expect(proof.costs).toEqual({
      lettersProcessed: 0,
      totalMicrousd: 0,
      averageMicrousd: 0,
      jevMicrousd: 0,
      ollamaMicrousd: 0,
    });
    expect(proof.keyscan.envVarNames).toEqual([]);
    expect(JSON.stringify(proof)).not.toContain('PRIVATE_');
  });
});

describe('proof route', () => {
  it('returns a schema-validated boot snapshot with no-store caching', async () => {
    const db = testDb();
    const proof = await collectProof({
      config: loadConfig({
        MAILKEEP_PUBLIC_URL: 'https://mailkeep.example',
        MAILKEEP_GIT_SHA: 'dev',
      }),
      db,
      client: { discover: async () => new Map() },
      keyscan: { found: 0, checkedAt: CHECKED_AT, hits: [] },
      env: {},
      now: () => NOW,
      hostname: () => 'sprite-proof',
      serviceList: async () =>
        JSON.stringify([
          {
            name: 'mailkeep',
            state: { status: 'running', started_at: '2026-11-24T10:00:00.000Z' },
          },
        ]),
      evalFiles: async () => [],
    });
    const app = proofRoutes({ proof });

    const response = await app.request('/api/proof');
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('application/json');
    expect(body).toEqual(proof);
    expect(proofSchema.parse(body)).toEqual(proof);
  });
});
