import { access, mkdir, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { type Browser, chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LETTERS_DIR = path.join(ROOT, 'testset', 'letters');
const BUILD_DIR = path.join(ROOT, 'testset', 'build');

export interface RenderMeta {
  id: string;
  photo: 'normal' | 'dark' | 'sideways' | 'blurry' | 'pdf';
}

async function readMeta(id: string): Promise<RenderMeta> {
  const raw = await readFile(path.join(LETTERS_DIR, id, 'meta.json'), 'utf8');
  return JSON.parse(raw) as RenderMeta;
}

export async function listLetterIds(): Promise<string[]> {
  const entries = await readdir(LETTERS_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export async function renderLetter(
  browser: Browser,
  id: string,
  photo: RenderMeta['photo'],
): Promise<{ pngPath: string; pdfPath?: string }> {
  await mkdir(BUILD_DIR, { recursive: true });
  const htmlPath = path.join(LETTERS_DIR, id, 'letter.html');
  const pngPath = path.join(BUILD_DIR, `${id}.png`);
  const page = await browser.newPage({
    viewport: { width: 816, height: 1056 },
    deviceScaleFactor: 2,
  });

  try {
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    await page.screenshot({ path: pngPath, animations: 'disabled', fullPage: false });

    if (photo === 'pdf') {
      const pdfPath = path.join(BUILD_DIR, `${id}.pdf`);
      await page.pdf({
        path: pdfPath,
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      });
      return { pngPath, pdfPath };
    }

    return { pngPath };
  } finally {
    await page.close();
  }
}

async function cachedChromium(): Promise<string | undefined> {
  const override = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (override) return override;

  const cache = path.join(homedir(), '.cache', 'ms-playwright');
  let entries: string[];
  try {
    entries = await readdir(cache);
  } catch {
    return undefined;
  }
  const revisions = entries
    .filter((entry) => /^chromium_headless_shell-\d+$/.test(entry))
    .sort((left, right) => Number(right.split('-').at(-1)) - Number(left.split('-').at(-1)));

  for (const revision of revisions) {
    const executable = path.join(
      cache,
      revision,
      'chrome-headless-shell-linux64',
      'chrome-headless-shell',
    );
    try {
      await access(executable);
      return executable;
    } catch {}
  }
  return undefined;
}

export async function renderAll(metas: readonly RenderMeta[]): Promise<void> {
  const browser = await chromium.launch({
    headless: true,
    executablePath: await cachedChromium(),
  });
  try {
    for (const meta of metas) {
      await renderLetter(browser, meta.id, meta.photo);
      console.log(`rendered ${meta.id}`);
    }
  } finally {
    await browser.close();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const ids = await listLetterIds();
  const metas = await Promise.all(ids.map(readMeta));
  await renderAll(metas);
}
