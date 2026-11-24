import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type DB, openDb } from '../src/db/db.js';
import { migrate } from '../src/db/migrate.js';
import { IntakeError, intakeFile, MAX_FILE_BYTES, sniffMime } from '../src/pipeline/intake.js';
import { extractPdf } from '../src/pipeline/pdf.js';
import { measureQuality, normaliseImage } from '../src/pipeline/quality.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const hasPdftotext = spawnSync('which', ['pdftotext']).status === 0;
let directory: string;
let db: DB;

beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), 'mailkeep-quality-'));
  db = openDb(path.join(directory, 'test.db'));
  migrate(db);
});

afterEach(async () => {
  db.close();
  await rm(directory, { recursive: true, force: true });
});

const GPS_EXIF_SEGMENT = Buffer.from(
  '/+EAiEV4aWYAAE1NACoAAAAIAAGIJQAEAAAAAQAAABoAAAAAAAQAAQACAAAAAk4AAAAAAgAFAAAAAwAAAFAAAwACAAAAAlcAAAAABAAFAAAAAwAAAGgAAAAAAAAAKQAAAAEAAAAwAAAAAQAAAAAAAAABAAAAVwAAAAEAAAA5AAAAAQAAAAAAAAAB',
  'base64',
);

function addGpsExif(jpeg: Buffer): Buffer {
  return Buffer.concat([jpeg.subarray(0, 2), GPS_EXIF_SEGMENT, jpeg.subarray(2)]);
}

describe('intake and image quality', () => {
  it('flags the dark L30 photo and not L01', async () => {
    const dark = await readFile(path.join(ROOT, 'testset/out/L30.jpg'));
    const normal = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));
    expect((await measureQuality(dark)).flagged).toBe(true);
    expect((await measureQuality(normal)).flagged).toBe(false);
  });

  it('strips GPS EXIF and writes a private normalised JPEG', async () => {
    const source = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));
    const withGps = addGpsExif(source);
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const output = path.join(directory, 'normalised.jpg');
    await normaliseImage(withGps, output);
    const metadata = await sharp(output).metadata();
    expect(metadata.exif).toBeUndefined();
    expect(metadata.orientation).toBeUndefined();
    expect((await stat(output)).mode & 0o777).toBe(0o600);
  });

  it('sniffs real formats and rejects HEIC and oversized files', async () => {
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg');
    expect(sniffMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      'image/png',
    );
    expect(sniffMime(Buffer.from('%PDF-1.7'))).toBe('application/pdf');
    const heic = Buffer.alloc(16);
    heic.write('ftyp', 4, 'ascii');
    heic.write('heic', 8, 'ascii');
    await expect(
      intakeFile({ bytes: heic, householdId: 'hh_test', dataDir: directory, db }),
    ).rejects.toBeInstanceOf(IntakeError);
    await expect(
      intakeFile({
        bytes: Buffer.alloc(MAX_FILE_BYTES + 1),
        householdId: 'hh_test',
        dataDir: directory,
        db,
      }),
    ).rejects.toMatchObject({ code: 'too_large' });
  });

  it('returns the existing letter for a duplicate hash', async () => {
    const bytes = await readFile(path.join(ROOT, 'testset/out/L01.jpg'));
    const first = await intakeFile({ bytes, householdId: 'hh_test', dataDir: directory, db });
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    db.prepare(
      `INSERT INTO letters
        (id, household_id, source, received_at, status, mime, sha256, local_path, created_at, updated_at)
       VALUES (?, ?, 'upload', ?, 'queued', 'image/jpeg', ?, ?, ?, ?)`,
    ).run(
      first.letterId,
      'hh_test',
      new Date().toISOString(),
      sha256,
      first.localPath,
      new Date().toISOString(),
      new Date().toISOString(),
    );
    const second = await intakeFile({ bytes, householdId: 'hh_test', dataDir: directory, db });
    expect(second.duplicate).toBe(true);
    expect(second.letterId).toBe(first.letterId);
  });
});

describe.skipIf(!hasPdftotext)('PDF extraction', () => {
  it('reads the L34 text layer', async () => {
    const pdfPath = path.join(ROOT, 'testset/out/L34.pdf');
    const result = await extractPdf(pdfPath, path.join(directory, 'pdf'));
    expect(result.text.length).toBeGreaterThanOrEqual(200);
    expect(result.images).toHaveLength(0);
    await writeFile(path.join(directory, 'pdf-text.txt'), result.text);
  }, 20_000);
});
