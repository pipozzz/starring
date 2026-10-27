import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankProfile, type Profile } from './model';
import { countChanges, diffProfiles } from './diff';

const live: Profile = {
  ...blankProfile(),
  handle: 'peter',
  theme: 'acid',
  profile: { name: 'Peter Gonda', role: 'DevOps Engineer', tagline: 'Calm production.', location: 'Slovakia', available: true, links: { github: 'https://github.com/pipozzz' } },
  contributions: [{ year: 2026, public: 0, private: 6609 }, { year: 2025, public: 0, private: 499 }],
  clients: [{ name: 'Northwind' }],
  projects: [{ title: 'goliash', year: 2026, visibility: 'public', blurb: 'Versions matrix.' }],
  skills: { Platform: ['AWS', 'Linux'] },
};

test('identical versions have no changes', () => {
  assert.deepEqual(diffProfiles(live, structuredClone(live)), []);
});

test('changes read like a person would say them, grouped by editor section', () => {
  const draft: Profile = structuredClone(live);
  draft.profile.tagline = 'Thirteen years of calm production.';
  draft.profile.photo = 'https://starring.dev/media/photos/u/a.jpg';
  draft.profile.links = { github: 'https://github.com/pipozzz', linkedin: 'https://linkedin.com/in/x' };
  draft.contributions = [{ year: 2026, public: 2932, private: 3677 }, { year: 2025, public: 0, private: 499 }];
  draft.activity = { '2026-10-01': 3 };
  draft.experience = [{ company: 'Pipoline', role: 'Founder', from: 2013, to: null }];
  draft.projects = [{ title: 'goliash', year: 2026, visibility: 'public', blurb: 'One matrix of versions.', impact: ['3 stars'] }, { title: 'nomploy', year: 2026, visibility: 'public', blurb: 'PaaS on Nomad.' }];
  draft.clients = [];
  draft.skills = { Platform: ['AWS', 'Nomad'] };

  const groups = diffProfiles(live, draft);
  const by = Object.fromEntries(groups.map((g) => [g.section, g.items]));
  assert.deepEqual(by.Headliner, ['tagline: “Calm production.” → “Thirteen years of calm production.”', 'photo added', 'linkedin link added']);
  assert.deepEqual(by.Numbers, ['2026 public: 0 → 2,932', '2026 private: 6,609 → 3,677', 'heatmap updated (1 active days)']);
  assert.deepEqual(by.Timeline, ['added Pipoline — Founder']);
  assert.deepEqual(by['Featured work'], ['changed “goliash” (blurb, impact)', 'added “nomploy”']);
  assert.deepEqual(by.Clients, ['removed Northwind']);
  assert.deepEqual(by['Skills & languages'], ['Platform: + Nomad; − Linux']);
  assert.equal(groups.find((g) => g.section === 'Numbers')?.id, 'contributions', 'ids match the editor sections');
  assert.equal(countChanges(groups), 11);
});

test('a reorder alone is a change too', () => {
  const a = { ...live, projects: [{ title: 'a', year: 2026, visibility: 'public' as const, blurb: 'x' }, { title: 'b', year: 2026, visibility: 'public' as const, blurb: 'y' }] };
  const b = { ...a, projects: [...a.projects].reverse() };
  assert.deepEqual(diffProfiles(a, b), [{ section: 'Featured work', id: 'projects', items: ['new order'] }]);
});
