// Copies the website files the iPhone app needs into www/ (Capacitor's webDir).
// The Worker, Firebase rules and the web-only service worker stay out of the app.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');
const include = ['index.html', 'privacy.html', 'terms.html', 'manifest.webmanifest', 'icons', 'media', 'retro', 'swing'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of include) {
  const src = join(root, f);
  if (!existsSync(src)) { console.error('missing ' + f); process.exit(1); }
  cpSync(src, join(out, f), { recursive: true });
}
console.log('www/ ready: ' + include.join(', '));
