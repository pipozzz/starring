import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { findRepos, scan } from './scan.mjs';

let root;
const git = (cwd, args, env = {}) =>
  execFileSync('git', args, { cwd, env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...env }, stdio: 'pipe' });

const commit = (repo, { email, date, msg, trailers = [] }) => {
  writeFileSync(join(repo, 'f.txt'), `${msg}\n${Math.random()}`);
  git(repo, ['add', '.']);
  const trailerArgs = trailers.flatMap((t) => ['--trailer', t]);
  git(repo, ['commit', '-q', '-m', msg, ...trailerArgs], {
    GIT_AUTHOR_NAME: 'X', GIT_AUTHOR_EMAIL: email, GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: 'X', GIT_COMMITTER_EMAIL: email, GIT_COMMITTER_DATE: date,
  });
};
const makeRepo = (path, remote) => {
  mkdirSync(path, { recursive: true });
  git(path, ['init', '-q', '-b', 'main']);
  if (remote) git(path, ['remote', 'add', 'origin', remote]);
  return path;
};

before(() => {
  root = mkdtempSync(join(tmpdir(), 'starring-scan-'));
  const client = makeRepo(join(root, 'clients', 'acme-secret-project'), 'git@gitlab.acme-corp.example:team/secret.git');
  commit(client, { email: 'me@agency.test', date: '2024-03-01T10:00:00Z', msg: 'TOP SECRET launch' });
  commit(client, { email: 'Me@Agency.test', date: '2024-03-01T15:00:00Z', msg: 'more secret' });
  commit(client, { email: 'someone@else.test', date: '2024-03-02T10:00:00Z', msg: 'not mine' });
  commit(client, { email: 'me@agency.test', date: '2025-07-04T09:00:00Z', msg: 'fix' });

  const oss = makeRepo(join(root, 'oss', 'public-lib'), 'https://github.com/me/public-lib.git');
  commit(oss, { email: 'me@personal.test', date: '2025-01-02T09:00:00Z', msg: 'oss' });

  // a second clone of the client repo must not double count
  git(root, ['clone', '-q', client, join(root, 'clones', 'acme-copy')]);
  mkdirSync(join(root, 'node_modules', 'pkg', '.git'), { recursive: true }); // skipped
});
after(() => rmSync(root, { recursive: true, force: true }));

test('finds repos, skips node_modules, does not descend into repos', () => {
  const repos = findRepos([root]).map((r) => r.slice(root.length).replaceAll('\\', '/'));
  assert.deepEqual(repos, ['/clients/acme-secret-project', '/clones/acme-copy', '/oss/public-lib']);
});

test('counts only my commits (case-insensitive email), de-duplicated across clones', () => {
  const r = scan(findRepos([root]), { emails: ['me@agency.test', 'me@personal.test'] });
  assert.equal(r.kind, 'starring-activity');
  assert.equal(r.totals.commits, 4);
  assert.deepEqual(r.years, [{ year: 2025, commits: 2 }, { year: 2024, commits: 2 }]);
  assert.equal(r.days['2024-03-01'], 2);
  assert.deepEqual(r.platforms.map((p) => p.name).sort(), ['GitHub', 'GitLab (self-hosted)']);
});

test('--co-authored counts trailer matches case-insensitively without double-counting', () => {
  const pairRoot = mkdtempSync(join(tmpdir(), 'starring-pair-'));
  try {
    const repo = makeRepo(join(pairRoot, 'team-project'), 'https://github.com/team/shared.git');
    // 1. Authored by teammate, user in Co-authored-by trailer
    commit(repo, { email: 'other@team.test', date: '2025-08-01T10:00:00Z', msg: 'pair feature', trailers: ['Co-authored-by: Me <ME@AGENCY.TEST>'] });
    // 2. Authored by user, user also in trailer (must count only once)
    commit(repo, { email: 'me@agency.test', date: '2025-08-02T10:00:00Z', msg: 'self pair', trailers: ['Co-authored-by: Me <me@agency.test>'] });
    // 3. Regular commit by user (no trailer)
    commit(repo, { email: 'me@agency.test', date: '2025-08-03T10:00:00Z', msg: 'solo fix' });
    // 4. Commit with someone else's trailer
    commit(repo, { email: 'other@team.test', date: '2025-08-04T10:00:00Z', msg: 'other work', trailers: ['Co-authored-by: Someone Else <other@else.test>'] });

    const withoutCo = scan([repo], { emails: ['me@agency.test'] });
    assert.equal(withoutCo.totals.commits, 2);

    const withCo = scan([repo], { emails: ['me@agency.test'], coauthored: true });
    assert.equal(withCo.totals.commits, 3);
    assert.equal(withCo.totals.authored, 2);
    assert.equal(withCo.totals.coauthored, 1);
  } finally {
    rmSync(pairRoot, { recursive: true, force: true });
  }
});

test('output holds no code, messages, repo names, paths, hosts or emails', () => {
  const json = JSON.stringify(scan(findRepos([root]), { emails: ['me@agency.test'], coauthored: true }));
  for (const leak of ['SECRET', 'secret', 'acme', 'public-lib', root, 'agency.test', 'gitlab.acme-corp']) {
    assert.ok(!json.includes(leak), `output leaks "${leak}"`);
  }
});

test('--reveal-hosts names self-hosted servers; --exclude skips hosts', () => {
  const revealed = scan(findRepos([root]), { emails: ['me@agency.test'], revealHosts: true });
  assert.ok(revealed.platforms.some((p) => p.name === 'gitlab.acme-corp.example'));
  const excluded = scan(findRepos([root]), { emails: ['me@agency.test', 'me@personal.test'], exclude: ['github.com'] });
  assert.equal(excluded.totals.commits, 3);
  assert.equal(excluded.totals.reposExcluded, 1);
});

test('--since and a missing email', () => {
  assert.equal(scan(findRepos([root]), { emails: ['me@agency.test'], since: '2025-01-01' }).totals.commits, 1);
  assert.throws(() => scan([], { emails: [] }), /No author email/);
});

test('with visibility, years and platforms split into public and private', () => {
  const repos = findRepos([root]);
  const visibility = new Map(repos.map((r) => [r, r.includes('public-lib') ? 'public' : 'private']));
  const r = scan(repos, { emails: ['me@agency.test', 'me@personal.test'], visibility });
  assert.equal(r.totals.commits, 4);
  assert.equal(r.totals.public, 1);
  assert.equal(r.totals.private, 3);
  assert.deepEqual(r.years, [{ year: 2025, commits: 2, public: 1, private: 1 }, { year: 2024, commits: 2, public: 0, private: 2 }]);
  assert.deepEqual(r.platforms.find((p) => p.name === 'GitHub'), { name: 'GitHub', kind: 'public', repos: 1, commits: 1 });
  assert.equal(r.platforms.find((p) => p.name === 'GitLab (self-hosted)')?.kind, 'private');
  // without it, the output stays exactly as before
  const plain = scan(repos, { emails: ['me@agency.test', 'me@personal.test'] });
  assert.equal(plain.totals.public, undefined);
  assert.deepEqual(plain.years, [{ year: 2025, commits: 2 }, { year: 2024, commits: 2 }]);
  assert.ok(plain.platforms.every((p) => !('kind' in p)));
});
