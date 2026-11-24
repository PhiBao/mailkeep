import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

export interface QualityMetrics {
  mean: number;
  stddev: number;
  lapVar: number;
  flagged: boolean;
}

export interface NormalisedImage {
  localPath: string;
  mime: 'image/jpeg';
  quality: QualityMetrics;
}

function laplacianVariance(data: Buffer, width: number, height: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const centre = data[index] ?? 0;
      const neighbours =
        (data[index - 1] ?? 0) +
        (data[index + 1] ?? 0) +
        (data[index - width] ?? 0) +
        (data[index + width] ?? 0);
      const laplacian = neighbours - 4 * centre;
      sum += laplacian * laplacian;
      count += 1;
    }
  }
  return count > 0 ? sum / count : 0;
}

export async function measureQuality(bytes: Buffer): Promise<QualityMetrics> {
  const { data, info } = await sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let sum = 0;
  for (const value of data) sum += value;
  const mean = data.length > 0 ? sum / data.length : 0;
  let squared = 0;
  for (const value of data) squared += (value - mean) ** 2;
  const stddev = data.length > 0 ? Math.sqrt(squared / data.length) : 0;
  const lapVar = laplacianVariance(data, info.width, info.height);
  return {
    mean,
    stddev,
    lapVar,
    flagged: mean < 60 || stddev < 25 || lapVar < 80,
  };
}

export async function normaliseImage(bytes: Buffer, outputPath: string): Promise<NormalisedImage> {
  const quality = await measureQuality(bytes);
  await mkdir(path.dirname(outputPath), { recursive: true });
  let image = sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: 'inside' });
  if (quality.flagged) image = image.sharpen({ sigma: 1.2 });

  for (const qualityValue of [85, 75, 65]) {
    const output = await image.clone().jpeg({ quality: qualityValue }).toBuffer();
    if (output.length <= 4 * 1024 * 1024 || qualityValue === 65) {
      await writeFile(outputPath, output, { mode: 0o600 });
      return { localPath: outputPath, mime: 'image/jpeg', quality };
    }
  }
  throw new Error('Could not normalise image below 4 MiB');
}
