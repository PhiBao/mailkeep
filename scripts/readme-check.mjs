import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const readme = readFileSync(path.join(ROOT, 'README.md'), 'utf8');
const requiredHeadings = [
  'Try it in 60 seconds',
  'Product',
  'Experience',
  'Innovation',
  'Hacksgiving relevance',
  'Prior art',
  'Provenance',
  'Architecture',
  'How it decides',
  'Running',
  'Demo',
  'Verification',
  'Evaluation',
  'Security and privacy',
  'Limitations and roadmap',
  'Why us',
  'License',
];
const requiredProof = [
  'Mailkeep remembers every letter Mom gets, and notices when the second notice arrives.',
  'https://mailkeep-hl3m.sprites.app/demo',
  'Demo video:',
  'https://mailkeep-hl3m.sprites.app/proof',
  'EVAL.md',
  'https://app.box.com/folder/440822123671',
  'https://github.com/PhiBao/mailkeep/commit/ef31881',
];

let failed = false;
for (const heading of requiredHeadings) {
  if (!readme.includes(`## ${heading}`)) {
    console.error(`Missing heading: ${heading}`);
    failed = true;
  }
}
for (const proof of requiredProof) {
  if (!readme.includes(proof)) {
    console.error(`Missing above-the-fold proof: ${proof}`);
    failed = true;
  }
}

const links = [...readme.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)].map(
  (match) => match[1],
);
for (const target of links) {
  if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
  const relative = decodeURIComponent(target.split('#')[0]).replace(/^\//, '');
  if (!relative || !existsSync(path.join(ROOT, relative))) {
    console.error(`Broken relative link: ${target}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else
  console.log(`README checks passed: ${requiredHeadings.length} headings, ${links.length} links.`);
