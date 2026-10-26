import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankProfile, type Profile } from '../lib/model';
import { at, buildScript, timeline, transcript } from './script';

const full: Profile = {
  ...blankProfile(),
  handle: 'jane',
  profile: { name: 'Jane Q Doe', role: 'Platform Engineer', links: {} },
  contributions: [{ year: 2024, public: 100, private: 900 }, { year: 2025, public: 0, private: 0 }],
  experience: [{ company: 'Acme', role: 'Lead', from: 2012, to: null }],
  clients: [{ name: 'Northwind Pictures' }, { name: 'The Weekly Ledger' }],
  projects: [
    { title: 'Open thing', year: 2023, visibility: 'public', blurb: 'x' },
    { title: 'Premiere Hub', client: 'Northwind Pictures', year: 2022, visibility: 'nda', blurb: 'x', impact: ['18M visits'] },
  ],
  openSource: [{ repo: 'liketrek/TREK', what: 'Slovak translation', stars: 15091 }],
  awards: [{ title: 'Best Streaming Experience', by: 'Craft & Code', year: 2022 }],
  testimonials: [{ quote: 'Calm under pressure.', name: 'Ann Lee', role: 'CTO', company: 'Acme' }],
};

test('a full profile gets every scene, in trailer order, ending on the title card', () => {
  const s = buildScript(full, 'https://starring.dev/jane/');
  assert.deepEqual(s.map((x) => x.kind), ['open', 'stat', 'stat', 'stat', 'heat', 'clients', 'nda', 'work', 'cameos', 'accolade', 'quote', 'title']);
  const nda = s.find((x) => x.kind === 'nda');
  assert.deepEqual(nda, { kind: 'nda', title: 'Premiere Hub', client: 'Northwind Pictures', impact: '18M visits' }, 'the NDA project with impact is chosen');
  const heat = s.find((x) => x.kind === 'heat');
  assert.ok(heat?.kind === 'heat' && heat.year === 2024 && heat.grid.length === 53 * 7, 'latest year with work, synthetic grid without activity');
  const title = s.at(-1);
  assert.deepEqual(title, { kind: 'title', first: 'Jane', last: 'Q Doe', role: 'Platform Engineer', url: 'starring.dev/jane' });
  const cameo = s.find((x) => x.kind === 'cameos');
  assert.equal(cameo?.kind === 'cameos' && cameo.items[0].logo, 'https://avatars.githubusercontent.com/liketrek?s=96');
});

test('a blank profile still makes a short, valid trailer', () => {
  const s = buildScript(blankProfile(), 'http://localhost/your-handle');
  assert.deepEqual(s.map((x) => x.kind), ['open', 'title']);
});

test('the clock maps time to scenes, clamped at both ends', () => {
  const tl = timeline(buildScript(full, 'x'), 1.5);
  assert.ok(Math.abs(tl.total - tl.items.reduce((sum, i) => sum + i.dur, 0)) < 1e-9);
  assert.equal(at(tl, -5).index, 0);
  assert.equal(at(tl, 0).scene.kind, 'open');
  assert.equal(at(tl, tl.total + 10).scene.kind, 'title');
  const second = tl.items[1];
  const mid = at(tl, second.start + second.dur / 2);
  assert.equal(mid.index, 1);
  assert.ok(Math.abs(mid.p - 0.5) < 1e-9);
});

test('the transcript says everything the video shows', () => {
  const lines = transcript(buildScript(full, 'https://starring.dev/jane'));
  assert.ok(lines.includes('1,000 commits.'));
  assert.ok(lines.includes('90% never seen on GitHub.'));
  assert.ok(lines.some((l) => l.startsWith('Premiere Hub for Northwind Pictures: under NDA, 18M visits')));
  assert.equal(lines.at(-1), 'Starring Jane Q Doe, Platform Engineer. starring.dev/jane');
});
