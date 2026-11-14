import assert from 'node:assert/strict';
import test from 'node:test';
import { blankProfile, type Profile } from '../lib/model';
import { findUpdates, readProfile, writeProfile } from './discover';

const found: Profile = {
  ...blankProfile(),
  handle: 'jane',
  profile: { ...blankProfile().profile, name: 'Jane', links: { github: 'https://github.com/jane' } },
  projects: [
    { title: 'tool', year: 2025, visibility: 'public', blurb: 'A tool.', impact: ['40 stars'], url: 'https://github.com/jane/tool' },
    { title: 'lib', year: 2024, visibility: 'public', blurb: 'A lib.', impact: ['9 stars'], url: 'https://github.com/jane/lib' },
  ],
  openSource: [{ repo: 'acme/engine', what: '12 commits', kind: 'code', url: 'https://github.com/acme/engine', stars: 900 }],
};

test('finds what the draft is missing, using its GitHub link, and applies it', async () => {
  const calls: { who: string; token?: string; deep?: boolean }[] = [];
  const importer = (async (who: string, o: { token?: string; deep?: boolean } = {}) => {
    calls.push({ who, ...o });
    return { profile: found, notes: [] };
  }) as never;
  const draft: Profile = {
    ...blankProfile(),
    handle: 'jane',
    profile: { ...blankProfile().profile, name: 'Jane Q.', links: { github: 'https://github.com/jane/' } },
    projects: [{ title: 'tool', year: 2025, visibility: 'public', blurb: 'Mine.', impact: ['10 stars'], url: 'https://github.com/jane/tool' }],
  };
  const { login, suggestions, updated } = await findUpdates({ draft, token: 't' }, importer);
  assert.equal(login, 'jane');
  assert.deepEqual(calls, [{ who: 'jane', token: 't', deep: true }], 'a token reads the whole history');
  assert.deepEqual(suggestions.map((s) => s.change.op).sort(), ['addCameo', 'addProject', 'setStars']);
  assert.equal(updated.profile.name, 'Jane Q.', 'the draft stays the draft');
  assert.deepEqual(updated.projects?.map((p) => [p.title, p.impact?.[0]]), [['tool', '40 stars'], ['lib', '9 stars']]);
  assert.equal(updated.openSource?.[0].repo, 'acme/engine');
  // and it reads back as a profile
  assert.deepEqual(readProfile(writeProfile(updated)), updated);
});

test('without a profile it needs a login; bad files are named', async () => {
  const importer = (async () => ({ profile: found, notes: [] })) as never;
  await assert.rejects(findUpdates({}, importer), /Which GitHub account/);
  const { suggestions } = await findUpdates({ login: '@jane' }, importer);
  assert.equal(suggestions.length, 3);
  assert.throws(() => readProfile('just: text'), /isn’t a Starring profile/);
});
