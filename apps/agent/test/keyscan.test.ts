import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanKeys } from '../src/sprite/keyscan.js';

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-keyscan-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('keyscan', () => {
  it('catches a planted provider-key pattern without returning its value', async () => {
    const secret = `${['s', 'k', '-'].join('')}1234567890abcdef`;
    await writeFile(path.join(directory, 'note.txt'), `credential=${secret}`);
    const result = await scanKeys({ root: directory, dataDir: directory, env: {} });
    expect(result.found).toBe(1);
    expect(result.hits.join(' ')).not.toContain(secret);
  });

  it('checks environment values by name and pattern', async () => {
    const secret = `${['p', 'c', 's', 'k', '_'].join('')}1234567890abcdef`;
    const result = await scanKeys({
      root: directory,
      dataDir: directory,
      env: { API_KEY: secret },
    });
    expect(result.found).toBe(1);
    expect(result.hits).toContain('env:API_KEY');
  });

  it('passes a clean directory', async () => {
    await writeFile(path.join(directory, 'note.txt'), 'No credentials are stored here.');
    const result = await scanKeys({ root: directory, dataDir: directory, env: { PORT: '8080' } });
    expect(result.found).toBe(0);
  });
});
