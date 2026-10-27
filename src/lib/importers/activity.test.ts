import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blankProfile } from '../model';
import { importActivity, isActivityFile } from './activity';

const file = {
  kind: 'starring-activity',
  version: 1,
  generatedAt: '2026-10-20T00:00:00Z',
  totals: { commits: 120, repos: 4, reposScanned: 9 },
  years: [{ year: 2025, commits: 100 }, { year: 2024, commits: 20 }],
  days: { '2025-03-01': 4, '2024-06-02': 1 },
  platforms: [{ name: 'GitLab (self-hosted)', repos: 3, commits: 110 }, { name: 'GitHub', repos: 1, commits: 10 }],
};

test('detects activity files', () => {
  assert.ok(isActivityFile(file));
  assert.ok(!isActivityFile({ basics: {} }));
});

test('replaces private counts per year, keeps public, marks verified', () => {
  const base = { ...blankProfile(), contributions: [{ year: 2025, public: 300, private: 5 }, { year: 2023, public: 50, private: 0 }] };
  const { profile, notes } = importActivity(file, { base });
  assert.deepEqual(profile.contributions, [
    { year: 2025, public: 300, private: 100, verified: true },
    { year: 2024, public: 0, private: 20, verified: true },
    { year: 2023, public: 50, private: 0 },
  ]);
  assert.deepEqual(profile.activity, file.days);
  assert.match(notes[0], /120 commits from 4 local repos/);
  assert.match(notes[1], /--check-public/);
});

test('adds platforms as private; re-import updates instead of duplicating', () => {
  const base = { ...blankProfile(), platforms: [{ name: 'GitHub', kind: 'public' as const, repos: 30, commits: 900 }] };
  const once = importActivity(file, { base }).profile;
  const twice = importActivity(file, { base: once }).profile;
  assert.deepEqual(twice.platforms?.map((p) => `${p.name}/${p.kind}/${p.commits}`), [
    'GitHub/public/900',
    'GitLab (self-hosted)/private/110',
    'GitHub (private repos)/private/10',
  ]);
});

test('rejects malformed or future files', () => {
  assert.throws(() => importActivity({ ...file, version: 2 }), /version 2/);
  assert.throws(() => importActivity({ ...file, years: [{ year: 2025, commits: -1 }] }), /whole number/);
  assert.throws(() => importActivity({ ...file, days: { 'last tuesday': 1 } }), /YYYY-MM-DD/);
});

test('a --check-public scan splits each year, and public commits are never added twice', () => {
  const split = {
    ...file,
    totals: { commits: 120, repos: 4, public: 70, private: 50 },
    years: [{ year: 2025, commits: 100, public: 60, private: 40 }, { year: 2024, commits: 20, public: 10, private: 10 }],
    platforms: [{ name: 'GitHub', kind: 'public', repos: 2, commits: 70 }, { name: 'GitHub', kind: 'private', repos: 1, commits: 30 }, { name: 'GitLab (self-hosted)', kind: 'private', repos: 1, commits: 20 }],
  };
  // the GitHub importer already counted 300 public contributions in 2025, and 5 in 2024
  const base = {
    ...blankProfile(),
    contributions: [{ year: 2025, public: 300, private: 0 }, { year: 2024, public: 5, private: 0 }],
    platforms: [{ name: 'GitHub', kind: 'public' as const, repos: 44, commits: 300 }],
  };
  const { profile, notes } = importActivity(split, { base });
  assert.deepEqual(profile.contributions, [
    { year: 2025, public: 300, private: 40, verified: true },
    { year: 2024, public: 10, private: 10, verified: true },
  ], 'public = the larger count, private from the scan');
  assert.deepEqual(profile.platforms, [
    { name: 'GitHub', kind: 'public', repos: 44, commits: 300 },
    { name: 'GitHub (private repos)', kind: 'private', repos: 1, commits: 30 },
    { name: 'GitLab (self-hosted)', kind: 'private', repos: 1, commits: 20 },
  ]);
  assert.match(notes[0], /70 in public repos, 50 in private/);
  assert.equal(notes.length, 1, 'no "re-scan" hint when the scan already knew');
});

test('a plain scan with GitHub repos suggests --check-public; a broken split is refused', () => {
  const { notes } = importActivity(file);
  assert.ok(notes.some((n) => n.includes('--check-public')));
  assert.throws(() => importActivity({ ...file, years: [{ year: 2025, commits: 10, public: 3, private: 3 }] }), /public \+ private/);
});
