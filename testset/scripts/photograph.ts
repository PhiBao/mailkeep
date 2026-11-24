import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type Sharp } from 'sharp';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TESTSET_DIR = path.join(ROOT, 'testset');
const ASSETS_DIR = path.join(TESTSET_DIR, 'assets');
const OUT_DIR = path.join(TESTSET_DIR, 'out');
const TABLE_PATH = path.join(ASSETS_DIR, 'table.jpg');
const WIDTH = 2400;
const HEIGHT = 3000;

export type PhotoVariant = 'normal' | 'dark' | 'sideways' | 'blurry' | 'pdf';

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureTable(): Promise<void> {
  await mkdir(ASSETS_DIR, { recursive: true });
  if (await fileExists(TABLE_PATH)) return;

  const random = mulberry32(0x4d41494c);
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const offset = (y * WIDTH + x) * 3;
      const grain = (random() - 0.5) * 20;
      const longWave = Math.sin(y / 43 + Math.sin(x / 510) * 1.8) * 5;
      const fineWave = Math.sin(x / 170 + y / 900) * 2.5;
      const vignette = (x / WIDTH) ** 2 * 7 + (y / HEIGHT) ** 2 * 5;
      pixels[offset] = Math.max(0, Math.min(255, 126 + grain + longWave - vignette));
      pixels[offset + 1] = Math.max(
        0,
        Math.min(255, 96 + grain * 0.7 + fineWave + longWave * 0.45 - vignette),
      );
      pixels[offset + 2] = Math.max(
        0,
        Math.min(255, 68 + grain * 0.45 + fineWave * 0.5 - vignette * 0.6),
      );
    }
  }

  await sharp(pixels, { raw: { width: WIDTH, height: HEIGHT, channels: 3 } })
    .jpeg({ quality: 90 })
    .toFile(TABLE_PATH);
}

async function addDarkNoise(image: Sharp, id: string): Promise<Buffer> {
  const base = await image.clone().ensureAlpha().png().toBuffer();
  const metadata = await sharp(base).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  const random = mulberry32(hashSeed(`${id}:noise`));
  const noisy = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < noisy.length; offset += 4) {
    const value = Math.floor(random() * 256);
    noisy[offset] = value;
    noisy[offset + 1] = value;
    noisy[offset + 2] = value;
    noisy[offset + 3] = 42;
  }
  const noise = await sharp(noisy, { raw: { width, height, channels: 4 } })
    .png()
    .toBuffer();
  return sharp(base)
    .modulate({ brightness: 0.35 })
    .composite([{ input: noise, blend: 'soft-light' }])
    .png()
    .toBuffer();
}

async function makeShadow(
  letter: Buffer,
): Promise<{ input: Buffer; width: number; height: number }> {
  const padded = await sharp(letter)
    .ensureAlpha()
    .extend({ top: 48, right: 48, bottom: 48, left: 48, background: '#00000000' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const shadow = Buffer.alloc(padded.data.length);
  for (let offset = 0; offset < padded.data.length; offset += 4) {
    shadow[offset] = 24;
    shadow[offset + 1] = 18;
    shadow[offset + 2] = 12;
    shadow[offset + 3] = Math.round(padded.data[offset + 3] * 0.3);
  }
  const blurred = await sharp(shadow, {
    raw: { width: padded.info.width, height: padded.info.height, channels: 4 },
  })
    .blur(18)
    .png()
    .toBuffer();
  return { input: blurred, width: padded.info.width, height: padded.info.height };
}

function cornerShadow(): Buffer {
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
      <defs>
        <filter id="soft"><feGaussianBlur stdDeviation="30"/></filter>
      </defs>
      <rect x="1540" y="-260" width="430" height="1850" fill="#20160e" opacity="0.16"
        transform="rotate(24 1755 665)" filter="url(#soft)"/>
    </svg>
  `);
}

export async function photographLetter(
  id: string,
  variant: PhotoVariant,
  pngPath: string,
): Promise<string> {
  await ensureTable();
  await mkdir(OUT_DIR, { recursive: true });
  const random = mulberry32(hashSeed(id));
  const angle = variant === 'sideways' ? 90 + (random() - 0.5) * 4 : (random() - 0.5) * 6;
  const targetHeight = variant === 'sideways' ? 2150 : 2600;
  const letter: Sharp = sharp(pngPath)
    .resize({ height: targetHeight })
    .rotate(angle, { background: '#00000000' })
    .blur(variant === 'blurry' ? 2.2 : 0.6);

  let letterBuffer = await letter.png().toBuffer();
  if (variant === 'dark') {
    letterBuffer = await addDarkNoise(letter, id);
  }

  const metadata = await sharp(letterBuffer).metadata();
  const letterWidth = metadata.width ?? 0;
  const letterHeight = metadata.height ?? 0;
  const left = Math.round((WIDTH - letterWidth) / 2 + (random() - 0.5) * 36);
  const top = Math.round((HEIGHT - letterHeight) / 2 + (random() - 0.5) * 36);
  const shadow = await makeShadow(letterBuffer);
  const outputPath = path.join(OUT_DIR, `${id}.jpg`);

  await sharp(TABLE_PATH)
    .composite([
      {
        input: shadow.input,
        left: left - 48,
        top: top - 20,
      },
      { input: letterBuffer, left, top },
      { input: cornerShadow(), left: 0, top: 0 },
    ])
    .jpeg({ quality: 78, chromaSubsampling: '4:2:0' })
    .toFile(outputPath);

  console.log(`photographed ${id} (${variant})`);
  return outputPath;
}
