import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PUBLIC = path.join(ROOT, 'apps/web/public');
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));

await mkdir(PUBLIC, { recursive: true });
const [favicon, literata, atkinson, mono] = await Promise.all([
  readFile(path.join(PUBLIC, 'favicon.svg')),
  readFile(require.resolve('@fontsource/literata/files/literata-latin-600-normal.woff2')),
  readFile(
    require.resolve(
      '@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2',
    ),
  ),
  readFile(require.resolve('@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2')),
]);

await sharp(favicon).resize(32, 32).png().toFile(path.join(PUBLIC, 'favicon-32.png'));

const appleMark = await sharp(favicon).resize(132, 132).png().toBuffer();
await sharp({
  create: { width: 180, height: 180, channels: 4, background: '#f6f1e7' },
})
  .composite([{ input: appleMark, left: 24, top: 24 }])
  .png()
  .toFile(path.join(PUBLIC, 'apple-touch-icon.png'));

const font = (bytes, family, weight) =>
  `@font-face{font-family:'${family}';src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2');font-weight:${weight}}`;
const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <style>
      ${font(literata, 'Literata', 600)}
      ${font(atkinson, 'Atkinson Hyperlegible', 700)}
      ${font(mono, 'IBM Plex Mono', 400)}
      .wordmark{font:600 52px Literata,Georgia,serif;fill:#1e2430}
      .kicker{font:700 16px 'Atkinson Hyperlegible',Arial,sans-serif;letter-spacing:1.6px;fill:#646b78}
      .identity{font:600 44px/1.25 Literata,Georgia,serif;fill:#1e2430}
      .meta{font:400 16px 'IBM Plex Mono',monospace;fill:#4a5261}
      .slip-title{font:600 30px Literata,Georgia,serif;fill:#1e2430}
      .amount{font:600 36px Literata,Georgia,serif;fill:#1e2430}
      .annotation{font:400 18px 'IBM Plex Mono',monospace;fill:#24507a}
    </style>
  </defs>
  <rect width="1200" height="630" fill="#f6f1e7"/>
  <g transform="translate(72 54) scale(1.75)">
    <rect x="3" y="7" width="26" height="19" rx="1.5" fill="#fffdf8" stroke="#1e2430" stroke-width="2.5"/>
    <polyline points="3,8 16,18 29,8" fill="none" stroke="#1e2430" stroke-width="2.5"/>
    <circle cx="26" cy="8" r="4.5" fill="#b3401f" stroke="#f6f1e7" stroke-width="1.5"/>
  </g>
  <text x="152" y="99" class="wordmark">Mailkeep</text>
  <text x="1128" y="91" text-anchor="end" class="kicker">FLY.IO HACKSGIVING 2026</text>
  <text x="72" y="190" class="identity">Mailkeep remembers every letter Mom gets,</text>
  <text x="72" y="246" class="identity">and notices when the second notice arrives.</text>
  <line x1="72" y1="304" x2="1128" y2="304" stroke="#d6cbb8"/>

  <rect x="72" y="344" width="480" height="152" rx="2" fill="#fffdf8" stroke="#d6cbb8"/>
  <rect x="72" y="344" width="6" height="152" fill="#4a5261"/>
  <text x="104" y="378" class="meta">NOV 18 · WEEK 1</text>
  <text x="104" y="422" class="slip-title">November water bill</text>
  <text x="104" y="468" class="amount">$84.17</text>
  <text x="520" y="468" text-anchor="end" class="meta">due Dec 10</text>

  <rect x="648" y="344" width="480" height="152" rx="2" fill="#fffdf8" stroke="#b3401f" stroke-width="2"/>
  <rect x="648" y="344" width="6" height="152" fill="#b3401f"/>
  <text x="680" y="378" class="meta">DEC 9 · WEEK 3</text>
  <text x="680" y="422" class="slip-title">PAST DUE notice</text>
  <text x="680" y="468" class="amount">$89.17</text>
  <text x="1096" y="468" text-anchor="end" class="meta">due Dec 16</text>

  <path d="M552 420H592Q600 420 600 428V434Q600 442 592 442H552" fill="none" stroke="#24507a" stroke-width="2" stroke-dasharray="6 5"/>
  <path d="M552 420l10-7v14Z" fill="#24507a"/>
  <path d="M430 542h18q8 0 8 8v8q0 8-8 8h-18" fill="none" stroke="#24507a" stroke-width="2"/>
  <path d="M430 542l10-7v14Z" fill="#24507a"/>
  <text x="482" y="561" class="annotation">second notice for this bill · 0.99</text>
  <text x="72" y="600" class="kicker">READ · REMEMBER · DECIDE · FILE · ASK ONLY WHEN NEEDED</text>
</svg>`;

await sharp(Buffer.from(og)).png().toFile(path.join(PUBLIC, 'og.png'));

for (const [name, width, height] of [
  ['favicon-32.png', 32, 32],
  ['apple-touch-icon.png', 180, 180],
  ['og.png', 1200, 630],
]) {
  const metadata = await sharp(path.join(PUBLIC, name)).metadata();
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`${name} is ${metadata.width}×${metadata.height}, expected ${width}×${height}`);
  }
  console.log(`${name}: ${metadata.width}×${metadata.height}`);
}
