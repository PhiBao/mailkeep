import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const css = readFileSync(path.join(ROOT, 'apps/web/src/styles/tokens.css'), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((match) => [match[1], match[2]]),
);

function channel(value) {
  const scaled = Number.parseInt(value, 16) / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  return (
    0.2126 * channel(hex.slice(1, 3)) +
    0.7152 * channel(hex.slice(3, 5)) +
    0.0722 * channel(hex.slice(5, 7))
  );
}

function contrast(foreground, background) {
  const a = luminance(tokens[foreground]);
  const b = luminance(tokens[background]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const pairs = [
  ['ink', 'paper'],
  ['ink', 'slip'],
  ['ink', 'paper-2'],
  ['ink-2', 'paper'],
  ['ink-2', 'slip'],
  ['ink-2', 'paper-2'],
  ['ink-3', 'paper'],
  ['ink-3', 'slip'],
  ['link', 'paper'],
  ['link', 'slip'],
  ['handled', 'slip'],
  ['headsup', 'slip'],
  ['needs', 'slip'],
  ['careful', 'slip'],
  ['slip', 'needs'],
];

let failed = false;
for (const [foreground, background] of pairs) {
  if (!tokens[foreground] || !tokens[background])
    throw new Error(`Missing token ${foreground}/${background}`);
  const ratio = contrast(foreground, background);
  const pass = ratio >= 4.5;
  if (!pass) failed = true;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${foreground} on ${background}: ${ratio.toFixed(2)}:1`);
}
if (failed) process.exitCode = 1;
