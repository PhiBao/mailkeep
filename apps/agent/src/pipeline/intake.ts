import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DB } from '../db/db.js';
import { id } from '../util/ids.js';
import { normaliseImage } from './quality.js';

export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_FILES_PER_INTAKE = 10;

export type IntakeMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export class IntakeError extends Error {
  constructor(
    public readonly code: 'too_large' | 'unsupported' | 'heic' | 'invalid',
    message: string,
  ) {
    super(message);
    this.name = 'IntakeError';
  }
}

function startsWith(bytes: Buffer, signature: number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

export function sniffMime(bytes: Buffer): IntakeMime | 'heic' | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (bytes.toString('ascii', 4, 8) === 'ftyp') {
    const brand = bytes.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1'].includes(brand)) return 'heic';
  }
  return null;
}

export interface IntakeInput {
  bytes: Buffer;
  householdId: string;
  dataDir: string;
  db: DB;
}

export interface IntakeResult {
  duplicate: boolean;
  letterId: string;
  sha256: string;
  mime: IntakeMime;
  localPath: string;
}

export async function intakeFile(input: IntakeInput): Promise<IntakeResult> {
  if (input.bytes.length === 0) throw new IntakeError('invalid', 'The file is empty.');
  if (input.bytes.length > MAX_FILE_BYTES) {
    throw new IntakeError('too_large', 'Files must be 15 MiB or smaller.');
  }
  const mime = sniffMime(input.bytes);
  if (mime === 'heic') {
    throw new IntakeError('heic', 'HEIC photos are not supported. Please take a new JPEG photo.');
  }
  if (!mime) throw new IntakeError('unsupported', 'Use a JPEG, PNG, WebP, or PDF file.');

  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const existing = input.db
    .prepare('SELECT id, local_path FROM letters WHERE household_id = ? AND sha256 = ?')
    .get(input.householdId, sha256) as { id: string; local_path: string } | undefined;
  if (existing) {
    return {
      duplicate: true,
      letterId: existing.id,
      sha256,
      mime,
      localPath: existing.local_path,
    };
  }

  const letterId = id('ltr');
  const directory = path.join(input.dataDir, 'originals', input.householdId);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (mime === 'application/pdf') {
    const localPath = path.join(directory, `${letterId}.pdf`);
    await writeFile(localPath, input.bytes, { mode: 0o600 });
    return { duplicate: false, letterId, sha256, mime, localPath };
  }

  const localPath = path.join(directory, `${letterId}.jpg`);
  await normaliseImage(input.bytes, localPath);
  return { duplicate: false, letterId, sha256, mime: 'image/jpeg', localPath };
}
