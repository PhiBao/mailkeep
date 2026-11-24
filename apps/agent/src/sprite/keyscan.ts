import type { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const PREFIXES = [
  ['s', 'k', '-'].join(''),
  ['p', 'c', 's', 'k', '_'].join(''),
  ['a', 'm', '_'].join(''),
];
const PREFIX_PATTERN = new RegExp(`\\b(?:${PREFIXES.join('|')})[A-Za-z0-9_-]{16,}`);
const BEARER_PATTERN = new RegExp(`${['B', 'e', 'a', 'r', 'e', 'r'].join('')} [A-Za-z0-9._-]{8,}`);
const LABELLED_PATTERN = /(?:key|token|secret)["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{32,})/i;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'coverage']);
const BINARY_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.db',
]);

export interface KeyscanResult {
  found: number;
  checkedAt: string;
  hits: string[];
}

function containsSecret(value: string): boolean {
  return PREFIX_PATTERN.test(value) || BEARER_PATTERN.test(value) || LABELLED_PATTERN.test(value);
}

async function walk(directory: string, hits: string[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(fullPath, hits);
      continue;
    }
    if (!entry.isFile() || BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

    try {
      const info = await stat(fullPath);
      if (info.size > 2_000_000) continue;
      const data = await readFile(fullPath);
      if (data.includes(0)) continue;
      if (containsSecret(data.toString('utf8'))) hits.push(fullPath);
    } catch {}
  }
}

export async function scanKeys(input: {
  root: string;
  dataDir: string;
  env: NodeJS.ProcessEnv;
}): Promise<KeyscanResult> {
  const hits: string[] = [];
  for (const [name, value] of Object.entries(input.env)) {
    if (!value) continue;
    const labelled = /(?:key|token|secret)/i.test(name) && value.length >= 32;
    if (labelled || containsSecret(value)) hits.push(`env:${name}`);
  }

  await walk(input.root, hits);
  if (path.resolve(input.dataDir) !== path.resolve(input.root)) {
    await walk(input.dataDir, hits);
  }

  return {
    found: hits.length,
    checkedAt: new Date().toISOString(),
    hits: [...new Set(hits)],
  };
}
