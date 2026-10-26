#!/usr/bin/env node
// Accessibility check of the static build with axe-core in headless Chrome.
//   npm run build && npm run test:a11y
// Serves dist/ itself, audits the main pages and the sample profile in every
// theme (so a new theme can't ship unreadable text), and fails on any violation.
// Chrome: CHROME_PATH, or the usual install locations on macOS / Linux.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';

const PORT = 4399;
const BASE = `http://localhost:${PORT}`;
const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const THEMES = readdirSync(join('src', 'themes')).filter((d) => statSync(join('src', 'themes', d)).isDirectory());
const PAGES = ['/', '/explore/', '/themes/', '/terms/', '/privacy/', '/edit/', '/nova/card/', '/nova/cv/', ...THEMES.map((t) => `/nova/?theme=${t}`)];

const chromePath = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].find((p) => p && existsSync(p));
if (!chromePath) {
  console.error('No Chrome found — set CHROME_PATH');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
const done = (code) => { procs.forEach((p) => p.kill()); server?.close(); process.exit(code); };

// a tiny static server for dist/ (astro preview allows only one instance per project)
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.xml': 'application/xml', '.txt': 'text/plain' };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, BASE).pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join('dist', path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': TYPES['.html'] }); return res.end(existsSync('dist/404.html') ? readFileSync('dist/404.html') : 'Not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(PORT);
if (!existsSync('dist/index.html')) { console.error('No dist/ — run npm run build first'); process.exit(1); }

const chrome = spawn(chromePath, ['--headless=new', '--remote-debugging-port=9335', '--no-first-run', '--no-sandbox', `--user-data-dir=${mkdtempSync(join(tmpdir(), 'starring-a11y-'))}`, 'about:blank'], { stdio: 'ignore' });
procs.push(chrome);
let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  target = await fetch('http://127.0.0.1:9335/json').then((r) => r.json()).then((l) => l.find((t) => t.type === 'page'), () => null);
}
if (!target) { console.error('Chrome did not start'); done(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;

await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
// scroll reveals start hidden; reduced motion shows everything at once, like many real visitors
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

let failed = 0;
for (const page of PAGES) {
  const [path, query] = page.split('?');
  await send('Page.navigate', { url: BASE + path });
  await sleep(1500);
  const theme = new URLSearchParams(query).get('theme');
  // every theme's CSS ships on every page, so re-skinning the sample profile tests that theme
  if (theme) await evaluate(`document.querySelectorAll('[data-theme]').forEach((el) => (el.dataset.theme = ${JSON.stringify(theme)})); true`);
  await evaluate(AXE);
  const violations = JSON.parse(await evaluate(`axe.run(document, { resultTypes: ['violations'] }).then((r) => JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, url: v.helpUrl, nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ') + ' — ' + (n.failureSummary || '').split('\\n').slice(1).join(' ').trim()) }))))`));
  if (!violations.length) { console.log(`  ✓ ${page}`); continue; }
  failed++;
  console.error(`  ✖ ${page}`);
  for (const v of violations) {
    console.error(`    [${v.impact}] ${v.id}: ${v.help}\n      ${v.url}`);
    v.nodes.forEach((n) => console.error(`      · ${n.slice(0, 240)}`));
  }
}
ws.close();
console.log(failed ? `\n✖ accessibility: ${failed} of ${PAGES.length} pages have violations` : `\n✓ accessibility: ${PAGES.length} pages, 0 violations`);
done(failed ? 1 : 0);
