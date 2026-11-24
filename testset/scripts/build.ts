import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
    links: Array<{ to: string; relation: string }>;
    closes: string | null;
  };
}

async function readMeta(id: string): Promise<LetterMeta> {
  const raw = await readFile(path.join(LETTERS_DIR, id, 'meta.json'), 'utf8');
  return JSON.parse(raw) as LetterMeta;
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

const truth = Object.fromEntries(metas.map((meta) => [meta.id, meta]));
await writeFile(
  path.join(ROOT, 'testset', 'truth.json'),
  `${JSON.stringify(truth, null, 2)}\n`,
  'utf8',
);
console.log(`built ${metas.length} letters`);
