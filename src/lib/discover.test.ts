import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankProfile, type Profile } from './model';
import { applyChange, discover } from './discover';

const draft: Profile = {
  ...blankProfile(),
  handle: 'peter',
  contributions: [{ year: 2026, public: 2932, private: 3677, verified: true }, { year: 2025, public: 10, private: 489 }],
  projects: [
    { title: 'goliash', year: 2026, visibility: 'public', blurb: 'Versions.', impact: ['3 stars', '1k installs'], url: 'https://github.com/pipozzz/goliash' },
    { title: 'Premiere Hub', year: 2021, visibility: 'nda', blurb: 'Launches.' },
  ],
  openSource: [{ repo: 'liketrek/TREK', what: 'Slovak translation', stars: 15091 }],
};

const found: Profile = {
  ...blankProfile(),
  handle: 'pipozzz',
  contributions: [{ year: 2026, public: 5762, private: 482, verified: true }, { year: 2025, public: 5, private: 0, verified: true }, { year: 2024, public: 124, private: 352, verified: true }],
  projects: [
    { title: 'goliash', year: 2026, visibility: 'public', blurb: 'Versions.', impact: ['5 stars'], url: 'https://github.com/pipozzz/goliash/' },
    { title: 'nomploy', year: 2026, visibility: 'public', role: 'Creator', blurb: 'PaaS on Nomad.', impact: ['4 stars', '740 commits'], url: 'https://github.com/Nomploy/nomploy' },
  ],
  openSource: [{ repo: 'liketrek/trek', what: 'Slovak translation', stars: 15150 }, { repo: 'goauthentik/authentik', what: 'Slovak translation', stars: 26125 }],
};

test('finds new projects, cameos, more stars and higher counts — never fewer', () => {
  const s = discover(draft, found);
  assert.deepEqual(s.map((x) => x.title), [
    'goliash: 3 → 5 stars',
    'Add “nomploy” to Featured work',
    'liketrek/trek: ★ 15,091 → ★ 15,150',
    'Add your work in goauthentik/authentik to Guest appearances',
    '2026: 2,932 → 5,762 public contributions',
    'Add 2024: 124 public contributions',
  ]);
  assert.ok(!s.some((x) => x.title.startsWith('2025')), 'a lower count is not a suggestion');
});

test('dismissed suggestions stay away; a bigger number later is new again', () => {
  const keys = new Set(discover(draft, found).map((x) => x.key));
  assert.deepEqual(discover(draft, found, keys), []);
  const more = { ...found, projects: [{ ...found.projects![0], impact: ['9 stars'] }] };
  assert.deepEqual(discover(draft, more, keys).map((x) => x.title), ['goliash: 3 → 9 stars']);
});

test('applying suggestions edits only what they say', () => {
  let p = draft;
  for (const s of discover(draft, found)) p = applyChange(p, s.change);
  assert.deepEqual(p.projects?.[0].impact, ['5 stars', '1k installs'], 'stars replaced, the rest kept');
  assert.equal(p.projects?.[1].title, 'Premiere Hub', 'NDA work untouched');
  assert.equal(p.projects?.[2].title, 'nomploy');
  assert.equal(p.openSource?.find((o) => o.repo === 'liketrek/TREK')?.stars, 15150);
  assert.ok(p.openSource?.some((o) => o.repo === 'goauthentik/authentik'));
  assert.deepEqual(p.contributions?.map((c) => [c.year, c.public, c.private]), [[2026, 5762, 3677], [2025, 10, 489], [2024, 124, 352]], 'private counts from the scan are kept');
});
