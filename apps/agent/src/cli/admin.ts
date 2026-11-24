import path from 'node:path';
import { loadConfig } from '../config.js';
import { openDb } from '../db/db.js';
import { migrate } from '../db/migrate.js';
import { addMember, createHousehold } from '../db/repo.js';

function parseFlags(args: string[]): { values: Map<string, string>; booleans: Set<string> } {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith('--')) continue;
    const key = argument.slice(2);
    const next = args[index + 1];
    if (next && !next.startsWith('--')) {
      values.set(key, next);
      index += 1;
    } else {
      booleans.add(key);
    }
  }
  return { values, booleans };
}

function required(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`Missing --${key}`);
  return value;
}

const [command, ...args] = process.argv.slice(2);
const { values, booleans } = parseFlags(args);
const config = loadConfig();
const db = openDb(path.join(config.MAILKEEP_DATA_DIR, 'mailkeep.db'));

try {
  migrate(db);
  let result: unknown;
  switch (command) {
    case 'migrate':
      result = { ok: true };
      break;
    case 'household:create': {
      const pineconeNamespace = values.get('pinecone-namespace');
      result = createHousehold(db, {
        name: required(values, 'name'),
        parentDisplay: required(values, 'parent-display'),
        timezone: values.get('tz') ?? 'America/Chicago',
        demo: booleans.has('demo'),
        ...(pineconeNamespace ? { pineconeNamespace } : {}),
      });
      break;
    }
    case 'member:add': {
      const role = required(values, 'role');
      if (role !== 'parent' && role !== 'family') throw new Error('Role must be parent or family');
      result = addMember(db, {
        householdId: required(values, 'household'),
        email: required(values, 'email'),
        displayName: required(values, 'name'),
        role,
      });
      break;
    }
    default:
      throw new Error('Usage: admin <migrate|household:create|member:add> [flags]');
  }
  console.log(JSON.stringify(result));
} finally {
  db.close();
}
