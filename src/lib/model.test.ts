import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANDLE, RESERVED, SUPPORTED_LANGS, THIS_YEAR, activityGrid, blankProfile, heatmap, plausibleTarget, resolveLang, totals, validate, type Profile } from './model';

const valid = (): Profile => ({
  ...blankProfile(),
  handle: 'jane-doe',
  profile: { name: 'Jane Doe', role: 'Engineer', links: { github: 'https://github.com/jane', email: 'mailto:jane@example.com' } },
});

test('a filled-in blank profile is valid', () => {
  assert.deepEqual(validate(valid()), {});
});

test('handles: lowercase, digits, dashes, 2–39 chars, not reserved', () => {
  for (const ok of ['ab', 'jane-doe', 'a1', 'x'.repeat(39)]) assert.ok(HANDLE.test(ok), ok);
  for (const bad of ['a', 'Jane', '-jane', 'jane_doe', 'x'.repeat(40), 'jane doe']) assert.ok(!HANDLE.test(bad), bad);
  for (const r of ['edit', 'api', 'themes', 'og', 'login']) {
    assert.ok(RESERVED.includes(r), r);
    assert.equal(validate({ ...valid(), handle: r }).handle, 'This handle is reserved');
  }
});

test('required fields and link schemes are enforced', () => {
  const p = valid();
  p.profile = { ...p.profile, name: ' ', links: { website: 'javascript:alert(1)' } };
  const issues = validate(p);
  assert.equal(issues['profile.name'], 'Required');
  assert.match(issues['profile.links.website'], /https:\/\/ or mailto:/);
});

test('NDA projects may not link to code', () => {
  const p = valid();
  p.projects = [{ title: 'Secret', blurb: 'x', year: 2024, visibility: 'nda', url: 'https://github.com/x/y' }];
  assert.match(validate(p)['projects.0.url'], /NDA/);
});

test('experience cannot end before it starts', () => {
  const p = valid();
  p.experience = [{ company: 'Acme', role: 'Dev', from: 2020, to: 2018 }];
  assert.equal(validate(p)['experience.0.to'], 'Ends before it starts');
});

test('totals add public and private commits and compute the private share', () => {
  const p = valid();
  p.contributions = [
    { year: 2024, public: 100, private: 300 },
    { year: 2025, public: 0, private: 100 },
  ];
  p.experience = [{ company: 'A', role: 'B', from: THIS_YEAR - 5, to: null }];
  const t = totals(p);
  assert.equal(t.all, 500);
  assert.equal(t.privateShare, 80);
  assert.equal(t.years, 5);
});

test('heatmap is deterministic, 53×7, levels 0–4, empty for zero', () => {
  const a = heatmap('jane', 2025, 1200);
  assert.equal(a.length, 53 * 7);
  assert.deepEqual(a, heatmap('jane', 2025, 1200));
  assert.ok(a.every((v) => v >= 0 && v <= 4));
  assert.ok(heatmap('jane', 2025, 0).every((v) => v === 0));
});

test('activityGrid places real days by weekday and quantises into 4 levels', () => {
  // 2025-01-01 is a Wednesday → 3 empty cells before it
  const activity = { '2025-01-01': 1, '2025-01-02': 2, '2025-01-03': 3, '2025-01-04': 10, '2024-12-31': 99 };
  const g = activityGrid(activity, 2025)!;
  assert.equal(g.length, 53 * 7);
  assert.deepEqual(g.slice(0, 7), [0, 0, 0, 1, 2, 3, 4]);
  assert.equal(activityGrid(activity, 2023), null);
  assert.equal(activityGrid(undefined, 2025), null);
});

test('per-profile Plausible: valid site ids and https origins only', () => {
  const base = valid();
  const ok = { ...base, analytics: { plausible: { domain: 'starring.dev/jane', host: 'https://plausible.example.com' } } };
  assert.deepEqual(validate(ok), {});
  assert.deepEqual(plausibleTarget(ok), { domain: 'starring.dev/jane', endpoint: 'https://plausible.example.com/api/event' });
  const sub = { ...base, analytics: { plausible: { domain: 'jane.dev', host: 'https://firma.example/plausible/' } } };
  assert.deepEqual(plausibleTarget(sub), { domain: 'jane.dev', endpoint: 'https://firma.example/plausible/api/event' }, 'self-hosted under a sub-path');
  assert.deepEqual(plausibleTarget({ ...base, analytics: { plausible: { domain: 'jane.dev' } } }), { domain: 'jane.dev', endpoint: 'https://plausible.io/api/event' });
  for (const host of ['http://plausible.io', 'javascript:alert(1)', 'https://user:pw@evil.example', 'https://x.example/?q=1']) {
    const bad = { ...base, analytics: { plausible: { domain: 'jane.dev', host } } };
    assert.ok(validate(bad)['analytics.plausible.host'], host);
    assert.equal(plausibleTarget(bad), null, host);
  }
  for (const domain of ['<script>', 'not a domain', 'a.b/c/d', 'localhost']) {
    assert.ok(validate({ ...base, analytics: { plausible: { domain } } })['analytics.plausible.domain'], domain);
  }
  assert.equal(plausibleTarget(base), null);
});

test('new sections: required fields, links, years, quote length, project live/image', () => {
  const base: Profile = { handle: 'jane', profile: { name: 'Jane', role: 'Dev' } };
  const bad = validate({
    ...base,
    awards: [{ title: '', year: 1800, url: 'ftp://x' }],
    certifications: [{ name: 'CKA', url: 'javascript:alert(1)' }],
    talks: [{ title: 'Talk', year: THIS_YEAR + 5 }],
    languages: [{ name: '' }],
    interests: [{ name: ' ' }],
    testimonials: [{ quote: 'x'.repeat(401), name: '' }],
    projects: [{ title: 'P', year: 2024, visibility: 'nda', blurb: 'b', live: 'example.com', image: 'http://insecure/img.png' }],
  });
  for (const k of ['awards.0.title', 'awards.0.year', 'awards.0.url', 'certifications.0.url', 'talks.0.year', 'languages.0.name', 'interests.0.name', 'testimonials.0.quote', 'testimonials.0.name', 'projects.0.live', 'projects.0.image']) {
    assert.ok(bad[k], k);
  }
  const ok = validate({
    ...base,
    awards: [{ title: 'Winner', by: 'Conf', year: 2024, url: 'https://conf.example' }],
    testimonials: [{ quote: 'Great.', name: 'Mara' }],
    projects: [{ title: 'P', year: 2024, visibility: 'nda', blurb: 'b', live: 'https://p.example', image: 'https://p.example/s.png' }],
  });
  assert.deepEqual(ok, {}, 'NDA projects may have a live link and an image');
});

test('resolveLang returns supported lang or falls back to en', () => {
  assert.equal(resolveLang(undefined), 'en', 'undefined → en');
  assert.equal(resolveLang(''), 'en', 'empty → en');
  assert.equal(resolveLang('en'), 'en', 'en stays en');
  assert.equal(resolveLang('es'), 'es', 'es stays es');
  assert.equal(resolveLang('en-US'), 'en', 'en-US → en');
  assert.equal(resolveLang('es-MX'), 'es', 'es-MX → es');
  assert.equal(resolveLang('de'), 'en', 'unsupported de → en');
  assert.equal(resolveLang('fr-CA'), 'en', 'unsupported fr-CA → en');
  assert.equal(resolveLang('invalid!!'), 'en', 'invalid tag → en');
  assert.deepEqual(SUPPORTED_LANGS, ['en', 'es'], 'supported langs are en and es');
});

test('profile.lang validation accepts valid BCP 47 tags', () => {
  const base = valid();
  assert.deepEqual(validate({ ...base, profile: { ...base.profile, lang: 'en' } }), {}, 'en is valid');
  assert.deepEqual(validate({ ...base, profile: { ...base.profile, lang: 'es' } }), {}, 'es is valid');
  assert.deepEqual(validate({ ...base, profile: { ...base.profile, lang: 'de' } }), {}, 'de is valid (unsupported but valid tag)');
  assert.deepEqual(validate({ ...base, profile: { ...base.profile, lang: 'en-US' } }), {}, 'en-US is valid');
  assert.ok(validate({ ...base, profile: { ...base.profile, lang: 'invalid!!' } })['profile.lang'], 'invalid tag fails');
  assert.ok(validate({ ...base, profile: { ...base.profile, lang: 'not a lang' } })['profile.lang'], 'garbage fails');
});
