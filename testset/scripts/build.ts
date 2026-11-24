import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { type PhotoVariant, photographLetter } from './photograph.js';
import { listLetterIds, type RenderMeta, renderAll } from './render.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LETTERS_DIR = path.join(ROOT, 'testset', 'letters');
const OUT_DIR = path.join(ROOT, 'testset', 'out');

interface LetterMeta extends RenderMeta {
  received: string;
  thread: string | null;
  demo: 'seed' | 'sample' | 'none';
  heldout: boolean;
  truth: {
    kind_ok: string[];
    lanes_ok: string[];
    needs_action: boolean;
    amount_cents: number | null;
    due_date: string | null;
    scam: boolean;
    links: Array<{ to: string; relation: string; optional?: boolean }>;
    closes: string | null;
  };
}

async function readMeta(id: string): Promise<LetterMeta> {
  const raw = await readFile(path.join(LETTERS_DIR, id, 'meta.json'), 'utf8');
  return JSON.parse(raw) as LetterMeta;
}

async function buildContactSheet(metas: readonly LetterMeta[]): Promise<void> {
  const columns = 5;
  const cellWidth = 480;
  const cellHeight = 620;
  const rows = Math.ceil(metas.length / columns);
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];

  for (const [index, meta] of metas.entries()) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = row * cellHeight;
    const source =
      meta.photo === 'pdf'
        ? path.join(ROOT, 'testset', 'build', `${meta.id}.png`)
        : path.join(OUT_DIR, `${meta.id}.jpg`);
    const thumbnail = await sharp(source)
      .resize({ width: 440, height: 540, fit: 'inside' })
      .toBuffer();
    const metadata = await sharp(thumbnail).metadata();
    const width = metadata.width ?? 440;
    const height = metadata.height ?? 540;
    const label = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${cellWidth}" height="54">
        <text x="24" y="35" font-family="Arial, sans-serif" font-size="25" fill="#1E2430">
          ${meta.id} · ${meta.received} · ${meta.photo}
        </text>
      </svg>
    `);
    layers.push(
      { input: label, left: x, top: y },
      {
        input: thumbnail,
        left: x + Math.round((cellWidth - width) / 2),
        top: y + 62 + Math.round((540 - height) / 2),
      },
    );
  }

  await sharp({
    create: {
      width: columns * cellWidth,
      height: rows * cellHeight,
      channels: 3,
      background: '#EDE5D5',
    },
  })
    .composite(layers)
    .jpeg({ quality: 86 })
    .toFile(path.join(OUT_DIR, '_contact.jpg'));
}

await rm(path.join(ROOT, 'testset', 'build'), { recursive: true, force: true });
await rm(OUT_DIR, { recursive: true, force: true });
await mkdir(OUT_DIR, { recursive: true });

const ids = await listLetterIds();
const metas = await Promise.all(ids.map(readMeta));
await renderAll(metas);

for (const meta of metas) {
  if (meta.photo === 'pdf') {
    const pdfPath = path.join(ROOT, 'testset', 'build', `${meta.id}.pdf`);
    await copyFile(pdfPath, path.join(OUT_DIR, `${meta.id}.pdf`));
    continue;
  }
  const pngPath = path.join(ROOT, 'testset', 'build', `${meta.id}.png`);
  await photographLetter(meta.id, meta.photo as PhotoVariant, pngPath);
}

if (metas.length >= 30) {
  await buildContactSheet(metas);
}

const truth = Object.fromEntries(metas.map((meta) => [meta.id, meta]));
await writeFile(
  path.join(ROOT, 'testset', 'truth.json'),
  `${JSON.stringify(truth, null, 2)}\n`,
  'utf8',
);
console.log(`built ${metas.length} letters`);
