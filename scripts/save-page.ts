// Plan morning-digest, section 3. Saves one rig page as a single self-contained HTML file
// (ADR 0001: one inline stylesheet, no client JS), without a browser and without a server.
// Usage: tsx --env-file-if-exists=.env scripts/save-page.ts <path> <out.html>
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createApp } from '../src/app.js';

const [path, out] = process.argv.slice(2);
if (!path || !out) {
  console.error('usage: save-page <path> <out.html>');
  process.exit(2);
}

const res = await createApp().request(path);
if (res.status !== 200) {
  console.error(`${path} answered ${res.status}`);
  process.exit(1);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, await res.text());
console.log(`saved ${path} → ${out}`);
