import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { blankProfile } from '../model';
import { GithubImportError, importGithub, prKind, prTitle, prettyTopic, usernameFrom } from './github';
import { ossHome, ossLogo } from '../model';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

const user = {
  login: 'Octo-Dev', name: 'Octo Dev', bio: 'Builds things.', location: 'Prague', blog: 'octo.dev',
  company: '@acme', html_url: 'https://github.com/Octo-Dev', twitter_username: 'octo', email: null, hireable: true, public_repos: 3,
};
const repos = [
  { name: 'star', description: 'Popular', language: 'TypeScript', topics: ['web-components', 'hacktoberfest'], stargazers_count: 120, forks_count: 10, fork: false, archived: false, html_url: 'https://github.com/Octo-Dev/star', pushed_at: '2025-03-01T00:00:00Z' },
  { name: 'forked', description: null, language: 'Go', stargazers_count: 999, forks_count: 0, fork: true, archived: false, html_url: 'x', pushed_at: '2025-01-01T00:00:00Z' },
  { name: 'old', description: null, language: 'Go', stargazers_count: 1, forks_count: 0, fork: false, archived: true, html_url: 'x', pushed_at: '2019-01-01T00:00:00Z' },
];

const mockFetch = (routes: Record<string, { status?: number; body: unknown }>) => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: string | URL) => {
    const url = String(input);
    calls.push(url);
    const hit = Object.entries(routes).find(([k]) => url.includes(k));
    const r = hit?.[1] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
};

test('usernameFrom accepts handles and profile URLs', () => {
  assert.equal(usernameFrom('@octo'), 'octo');
  assert.equal(usernameFrom('https://github.com/octo/'), 'octo');
  assert.equal(usernameFrom('github.com/octo?tab=repositories'), 'octo');
  assert.equal(usernameFrom('www.github.com/octo'), 'octo');
});

test('builds a draft from public data without a token', async () => {
  const calls = mockFetch({ '/users/Octo-Dev/repos': { body: repos }, '/users/Octo-Dev': { body: user } });
  const { profile, notes } = await importGithub('Octo-Dev');
  assert.ok(calls.every((c) => c.startsWith('https://api.github.com/')), 'only talks to api.github.com');
  assert.equal(profile.handle, 'octo-dev');
  assert.equal(profile.profile.name, 'Octo Dev');
  assert.equal(profile.profile.links?.website, 'https://octo.dev');
  assert.equal(profile.profile.links?.x, 'https://x.com/octo');
  assert.deepEqual(profile.projects?.map((p) => p.title), ['star'], 'skips forks and archived repos');
  assert.deepEqual(profile.projects?.[0].impact, ['120 stars', '10 forks']);
  assert.deepEqual(profile.skills?.Languages, ['TypeScript']);
  assert.deepEqual(profile.skills?.Topics, ['Web Components'], 'event tags like hacktoberfest are not skills');
  assert.ok(notes.some((n) => /token/.test(n)));
  assert.ok(notes.some((n) => /acme/.test(n)));
});

test('merge keeps private/NDA work and clients', async () => {
  mockFetch({ '/users/Octo-Dev/repos': { body: repos }, '/users/Octo-Dev': { body: user } });
  const base = { ...blankProfile(), clients: [{ name: 'Globex', nda: true }], projects: [{ title: 'Secret', year: 2024, visibility: 'nda' as const, blurb: 'x' }] };
  const { profile } = await importGithub('Octo-Dev', { base });
  assert.deepEqual(profile.clients, base.clients);
  assert.deepEqual(profile.projects?.map((p) => p.title), ['star', 'Secret']);
});

test('unknown user and rate limits become readable errors', async () => {
  mockFetch({});
  await assert.rejects(importGithub('nobody-here'), (e) => e instanceof GithubImportError && /No GitHub user/.test(e.message));
  mockFetch({ '/users/x1': { status: 403, body: {} } });
  await assert.rejects(importGithub('x1'), /rate limit/);
  await assert.rejects(importGithub('not a user!'), /doesn’t look like/);
});

test('merged PRs to other projects become guest appearances', async () => {
  const pr = (repo: string, title: string, n: number, closed: string) => ({
    title, html_url: `https://github.com/${repo}/pull/${n}`, repository_url: `https://api.github.com/repos/${repo}`, closed_at: closed,
  });
  const calls = mockFetch({
    '/search/issues': { body: { items: [
      pr('liketrek/TREK', 'feat(i18n): add Slovak (sk) translation', 2425, '2026-09-21T10:00:00Z'),
      pr('acme/tool', 'fix: retry on 429', 7, '2025-02-01T00:00:00Z'),
      pr('acme/tool', 'docs: explain retries', 9, '2025-03-01T00:00:00Z'),
    ] } },
    '/repos/liketrek/TREK': { body: { stargazers_count: 15091 } },
    '/repos/acme/tool': { body: { stargazers_count: 40 } },
    '/users/Octo-Dev/repos': { body: repos },
    '/users/Octo-Dev': { body: user },
  });
  const base = { ...blankProfile(), openSource: [{ repo: 'by/hand', what: 'Kept' }, { repo: 'liketrek/trek', what: 'Old text' }] };
  const { profile, notes } = await importGithub('Octo-Dev', { base });
  assert.ok(calls.some((c) => decodeURIComponent(c).includes('is:pr is:merged author:Octo-Dev -user:Octo-Dev')));
  assert.deepEqual(profile.openSource?.map((o) => o.repo), ['liketrek/TREK', 'acme/tool', 'by/hand'], 'biggest first, hand-made kept, re-imported replaced');
  const [trek, tool] = profile.openSource!;
  assert.equal(trek.what, 'Add Slovak (sk) translation');
  assert.equal(trek.kind, 'translation');
  assert.equal(trek.url, 'https://github.com/liketrek/TREK/pull/2425');
  assert.equal(trek.stars, 15091);
  assert.equal(trek.year, 2026);
  assert.equal(tool.prs, 2);
  assert.equal(tool.what, 'Explain retries and 1 more');
  assert.match(tool.url!, /^https:\/\/github\.com\/acme\/tool\/pulls\?q=/);
  assert.ok(notes.some((n) => /Guest appearances/.test(n)));
});

test('a failing PR search never breaks the import', async () => {
  mockFetch({ '/search/issues': { status: 403, body: {} }, '/users/Octo-Dev/repos': { body: repos }, '/users/Octo-Dev': { body: user } });
  const { profile } = await importGithub('Octo-Dev');
  assert.deepEqual(profile.openSource, []);
});

test('PR titles lose their conventional-commit prefix', () => {
  assert.equal(prTitle('feat(i18n): add Slovak (sk) translation'), 'Add Slovak (sk) translation');
  assert.equal(prTitle('[docs] fix: typo'), 'Typo');
  assert.equal(prTitle('Add a thing'), 'Add a thing');
  assert.equal(prKind(['Update README']), 'docs');
  assert.equal(prKind(['Add German locale']), 'translation');
  assert.equal(prKind(['Speed up parser']), 'code');
});

test('project logo and home come from the GitHub owner', () => {
  assert.equal(ossLogo({ repo: 'liketrek/TREK', what: 'x' }), 'https://avatars.githubusercontent.com/liketrek?s=96');
  assert.equal(ossHome({ repo: 'liketrek/TREK', what: 'x', url: 'https://github.com/liketrek/TREK/pull/1' }), 'https://github.com/liketrek/TREK');
  assert.equal(ossLogo({ repo: 'GNOME', what: 'x' }), undefined);
  assert.equal(ossLogo({ repo: 'gitlab-org/gitlab', what: 'x', url: 'https://gitlab.com/gitlab-org/gitlab/-/merge_requests/1' }), undefined);
  assert.equal(ossLogo({ repo: 'x/y', what: 'x', logo: 'https://e.com/l.png' }), 'https://e.com/l.png');
});

test('project stacks keep technologies and drop labels like hacktoberfest or devops', async () => {
  const labelled = [{ ...repos[0], name: 'goliash', language: 'Go', topics: ['devops', 'aws-lambda', 'hacktoberfest', 'docker', 'developer-portfolio', 'kubernetes'] }];
  mockFetch({ '/users/Octo-Dev/repos': { body: labelled }, '/users/Octo-Dev': { body: user } });
  const { profile } = await importGithub('Octo-Dev');
  assert.deepEqual(profile.projects?.[0].stack, ['Go', 'AWS Lambda', 'Docker', 'Kubernetes']);
  assert.deepEqual(profile.skills?.Topics, ['AWS Lambda', 'Docker', 'Kubernetes']);
});

test('topics are spelled the way the technologies are', () => {
  assert.equal(prettyTopic('aws-lambda'), 'AWS Lambda');
  assert.equal(prettyTopic('nodejs'), 'Node.js');
  assert.equal(prettyTopic('github-actions'), 'GitHub Actions');
  assert.equal(prettyTopic('postgresql'), 'PostgreSQL');
  assert.equal(prettyTopic('rest-api'), 'REST API');
  assert.equal(prettyTopic('web-components'), 'Web Components');
});

test("an org repo where you're the top contributor is your project, not a guest appearance", async () => {
  const commit = (repo: string, date: string) => ({ repository: { full_name: repo }, commit: { author: { date } } });
  mockFetch({
    '/search/issues': { body: { items: [] } },
    '/search/commits': { body: { items: [
      commit('Nomploy/nomploy', '2026-10-20T10:00:00Z'), commit('Nomploy/nomploy', '2026-10-21T10:00:00Z'),
      commit('bigco/engine', '2025-05-01T10:00:00Z'),
      commit('client/secret', '2024-01-01T10:00:00Z'),
    ] } },
    // contributors first: the mock matches the first key a URL contains
    '/repos/Nomploy/nomploy/contributors': { body: [{ login: 'Octo-Dev', contributions: 740 }, { login: 'github-actions[bot]', contributions: 1 }] },
    '/repos/Nomploy/nomploy': { body: { full_name: 'Nomploy/nomploy', name: 'nomploy', description: 'Open-source PaaS on Nomad', language: 'TypeScript', topics: ['nomad', 'hacktoberfest'], stargazers_count: 4, private: false, fork: false, archived: false, html_url: 'https://github.com/Nomploy/nomploy', homepage: 'https://nomploy.com', pushed_at: '2026-10-27T00:00:00Z', owner: { login: 'Nomploy', type: 'Organization' } } },
    '/repos/bigco/engine/contributors': { body: [{ login: 'someone', contributions: 900 }, { login: 'octo-dev', contributions: 12 }] },
    '/repos/bigco/engine': { body: { full_name: 'bigco/engine', name: 'engine', description: null, language: 'Go', stargazers_count: 2000, private: false, fork: false, archived: false, html_url: 'https://github.com/bigco/engine', homepage: null, pushed_at: '2026-01-01T00:00:00Z', owner: { login: 'bigco', type: 'Organization' } } },
    '/repos/client/secret/contributors': { body: [{ login: 'boss', contributions: 50 }] },
    '/repos/client/secret': { body: { full_name: 'client/secret', name: 'secret', description: 'x', language: 'Go', stargazers_count: 0, private: true, fork: false, archived: false, html_url: 'x', homepage: null, pushed_at: '2024-01-01T00:00:00Z', owner: { login: 'client', type: 'Organization' } } },
    '/users/Octo-Dev/repos': { body: repos },
    '/users/Octo-Dev': { body: user },
  });
  const { profile, notes } = await importGithub('Octo-Dev');
  const nomploy = profile.projects?.find((p) => p.title === 'nomploy');
  assert.ok(nomploy, 'in Featured work');
  assert.equal(nomploy!.role, 'Creator');
  assert.equal(nomploy!.url, 'https://github.com/Nomploy/nomploy');
  assert.equal(nomploy!.live, 'https://nomploy.com');
  assert.deepEqual(nomploy!.impact, ['4 stars', '740 commits']);
  assert.deepEqual(nomploy!.stack, ['TypeScript', 'Nomad']);
  assert.deepEqual(profile.projects?.map((p) => p.title), ['star', 'nomploy'], 'sorted by stars with your own repos');
  assert.deepEqual(profile.openSource?.map((o) => o.repo), ['bigco/engine'], 'not a guest appearance; someone else’s private repo is left out');
  assert.equal(profile.openSource?.[0].what, '1 commit');
  assert.equal(profile.openSource?.[0].url, 'https://github.com/bigco/engine/commits?author=Octo-Dev');
  assert.ok(notes.some((n) => /nomploy lives under an organisation, but it’s yours/.test(n)));
});
