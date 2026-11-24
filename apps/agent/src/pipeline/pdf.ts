import { execFile } from 'node:child_process';
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const TIMEOUT_MS = 20_000;

export interface PdfExtraction {
  text: string;
  images: string[];
}

export async function extractPdf(pdfPath: string, workDir: string): Promise<PdfExtraction> {
  const { stdout } = await execFileAsync('pdftotext', ['-layout', '-l', '3', pdfPath, '-'], {
    timeout: TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (stdout.length >= 200) return { text: stdout, images: [] };

  await mkdir(workDir, { recursive: true });
  const prefix = path.join(workDir, 'page');
  await execFileAsync('pdftoppm', ['-r', '150', '-f', '1', '-l', '2', '-jpeg', pdfPath, prefix], {
    timeout: TIMEOUT_MS,
    maxBuffer: 10 * 1024 * 1024,
  });
  const files = (await readdir(workDir)).filter((file) => /^page-\d+\.jpg$/.test(file)).sort();
  return { text: stdout, images: files.map((file) => path.join(workDir, file)) };
}
