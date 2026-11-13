import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { blankProfile } from '../model';
import { GitlabImportError, importGitlab, parseGitlab } from './gitlab';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

type Route = { status?: number; body: unknown; total?: number };
const mockFetch = (routes: Record<string, Route>) => {
  const calls: { url: string; token?: string }[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, token: (init?.headers as Record<string, string> | undefined)?.['PRIVATE-TOKEN'] });
    // longest matching key wins, so /users/7/projects beats /users/7
    const hit = Object.entries(routes).filter(([k]) => url.includes(k)).sort((a, b) => b[0].length - a[0].length)[0];
    const r = hit?.[1] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers: r.total ? { 'x-total': String(r.total) } : {} });
  }) as typeof fetch;
  return calls;
};

const thisYear = new Date().getFullYear();
const project = (id: number, path: string, stars: number, extra: object = {}) => ({
  id, name: path.split('/').pop(), path_with_namespace: path, description: `About ${path}`, web_url: `https://gitlab.com/${path}`,
  star_count: stars, forks_count: 0, topics: ['go', 'hacktoberfest'], last_activity_at: `${thisYear}-03-01T00:00:00Z`,
  namespace: { path: path.split('/')[0], kind: 'user' }, ...extra,
});
const routes = (more: Record<string, Route> = {}): Record<string, Route> => ({
  '/users?username=jane': { body: [{ id: 7, username: 'Jane', name: 'Jane Doe', web_url: 'https://gitlab.com/Jane' }] },
  '/users/7': { status: 403, body: { message: '403 Forbidden' } },
  '/users/7/projects': { total: 3, body: [project(1, 'Jane/small', 2), project(2, 'Jane/big', 90), project(3, 'Jane/fork', 999, { forked_from_project: { id: 9 } })] },
  '/users/7/contributed_projects': { body: [project(1, 'Jane/small', 2), project(50, 'acme/engine', 4000, { namespace: { path: 'acme', kind: 'group' } }), project(60, 'other/quiet', 10)] },
  '/users/7/events': { body: [
    { project_id: 50, action_name: 'pushed to', created_at: `${thisYear}-02-01T00:00:00Z`, push_data: { commit_count: 3 } },
    { project_id: 50, action_name: 'pushed to', created_at: `${thisYear - 1}-05-01T00:00:00Z`, push_data: { commit_count: 2 } },
    { project_id: 1, action_name: 'opened', created_at: `${thisYear - 1}-06-01T00:00:00Z` },
  ] },
  ...more,
});

test('parseGitlab reads usernames, profile URLs and self-hosted addresses', () => {
  assert.deepEqual(parseGitlab('@jane'), { instance: 'https://gitlab.com', username: 'jane' });
  assert.deepEqual(parseGitlab('https://gitlab.com/jane/'), { instance: 'https://gitlab.com', username: 'jane' });
  assert.deepEqual(parseGitlab('gitlab.example.org/jane'), { instance: 'https://gitlab.example.org', username: 'jane' });
  assert.deepEqual(parseGitlab('jane', 'git.corp.io/'), { instance: 'https://git.corp.io', username: 'jane' });
});

test('builds a draft from public gitlab.com data without a token', async () => {
  const calls = mockFetch(routes());
  const { profile, notes } = await importGitlab('jane');
  assert.ok(calls.every((c) => c.url.startsWith('https://gitlab.com/api/v4/')), 'only talks to the instance API');
  assert.ok(calls.every((c) => !c.token));
  assert.equal(profile.handle, 'jane');
  assert.equal(profile.profile.name, 'Jane Doe');
  assert.equal(profile.profile.links?.gitlab, 'https://gitlab.com/Jane');
  assert.deepEqual(profile.projects?.map((p) => p.title), ['big', 'small'], 'skips forks, best first');
  assert.deepEqual(profile.projects?.[0].impact, ['90 stars']);
  assert.deepEqual(profile.projects?.[0].stack, ['Go'], 'event tags are not skills');
  assert.deepEqual(profile.openSource?.map((o) => [o.repo, o.what, o.year]), [['acme/engine', '5 commits', thisYear], ['other/quiet', 'Contributor', undefined]], 'their own project is not a guest appearance');
  assert.deepEqual(profile.contributions?.map((c) => [c.year, c.public]), [[thisYear, 3], [thisYear - 1, 3]]);
  assert.deepEqual(profile.platforms?.[0], { name: 'GitLab', kind: 'public', repos: 3, commits: 5 });
  assert.ok(notes.some((n) => /token/.test(n)), 'says a token brings the bio and links');
});

test('with a token: bio, links and job title, sent as PRIVATE-TOKEN', async () => {
  const calls = mockFetch(routes({
    '/users/7': { body: { id: 7, username: 'Jane', name: 'Jane Doe', web_url: 'https://gitlab.com/Jane', bio: 'Ships Go.', location: 'Brno, CZ', website_url: 'jane.dev', job_title: 'Staff Engineer', twitter: '@janedoe', linkedin: 'janedoe' } },
  }));
  const { profile } = await importGitlab('jane', { token: 'glpat-x' });
  assert.ok(calls.every((c) => c.token === 'glpat-x'));
  assert.equal(profile.profile.tagline, 'Ships Go.');
  assert.equal(profile.profile.location, 'Brno, CZ');
  assert.equal(profile.profile.role, 'Staff Engineer');
  assert.equal(profile.profile.links?.website, 'https://jane.dev');
  assert.equal(profile.profile.links?.x, 'https://x.com/janedoe');
  assert.equal(profile.profile.links?.linkedin, 'https://www.linkedin.com/in/janedoe');
});

test('merge keeps GitHub work, NDA projects, clients and yearly counts', async () => {
  mockFetch(routes());
  const base = {
    ...blankProfile(),
    handle: 'jane-gh',
    clients: [{ name: 'Globex', nda: true }],
    contributions: [{ year: thisYear, public: 800, private: 200, verified: true }],
    platforms: [{ name: 'GitHub', kind: 'public' as const, repos: 10, commits: 800 }],
    projects: [
      { title: 'gh-tool', year: 2024, visibility: 'public' as const, blurb: 'x', url: 'https://github.com/jane/gh-tool' },
      { title: 'Secret', year: 2024, visibility: 'nda' as const, blurb: 'y' },
    ],
  };
  const { profile } = await importGitlab('jane', { base });
  assert.equal(profile.handle, 'jane-gh', 'a merge never changes the handle');
  assert.deepEqual(profile.clients, base.clients);
  assert.deepEqual(profile.contributions, base.contributions);
  assert.deepEqual(profile.platforms?.map((p) => p.name), ['GitLab', 'GitHub']);
  assert.deepEqual(profile.projects?.map((p) => p.title), ['big', 'small', 'gh-tool', 'Secret']);
});

test('self-hosted instances are named so, and errors are readable', async () => {
  const calls = mockFetch(Object.fromEntries(Object.entries(routes()).map(([k, v]) => [k, v])));
  const { profile } = await importGitlab('https://git.corp.io/jane');
  assert.ok(calls[0].url.startsWith('https://git.corp.io/api/v4/'));
  assert.equal(profile.platforms?.[0].name, 'GitLab (self-hosted)');

  mockFetch({ '/users?username=': { body: [] } });
  await assert.rejects(importGitlab('nobody'), (e) => e instanceof GitlabImportError && /No GitLab user “nobody” on gitlab.com/.test(e.message));
  mockFetch({ '/users?username=': { status: 401, body: {} } });
  await assert.rejects(importGitlab('jane', { token: 'bad' }), /rejected the token/);
  await assert.rejects(importGitlab('jane', { instance: 'http://git.corp.io' }), /https:\/\//);
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
  await assert.rejects(importGitlab('git.corp.io/jane'), /CORS/);
});
