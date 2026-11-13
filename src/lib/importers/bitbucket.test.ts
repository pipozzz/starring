import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { blankProfile } from '../model';
import { BitbucketImportError, importBitbucket, parseBitbucket, prettyLanguage } from './bitbucket';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

type Route = { status?: number; body: unknown };
const mockFetch = (routes: Record<string, Route>) => {
  const calls: { url: string; auth?: string }[] = [];
  globalThis.fetch = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    // longest matching key wins
    const hit = Object.entries(routes).filter(([k]) => url.includes(k)).sort((a, b) => b[0].length - a[0].length)[0];
    const r = hit?.[1] ?? { status: 404, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return calls;
};

const repo = (slug: string, extra: object = {}) => ({
  name: slug, slug, full_name: `acme/${slug}`, description: '', is_private: false, language: 'javascript', website: null,
  created_on: '2019-01-01T00:00:00Z', updated_on: '2024-05-01T00:00:00Z', parent: null, links: { html: { href: `https://bitbucket.org/acme/${slug}` } }, ...extra,
});
const commit = (date: string, who: string, id?: string) => ({ date, author: { raw: `${who} <x@example.com>`, ...(id && { user: { account_id: id, display_name: who } }) } });

const routes = (more: Record<string, Route> = {}): Record<string, Route> => ({
  '/workspaces/acme': { body: { slug: 'acme', name: 'Jane Doe', links: { html: { href: 'https://bitbucket.org/acme/' } } } },
  '/repositories/acme?': { body: { size: 4, values: [
    repo('shop', { description: 'The online shop.', website: 'https://shop.example.com' }),
    repo('notes', { language: 'python', updated_on: '2023-01-01T00:00:00Z' }),
    repo('vault', { is_private: true, language: 'php', description: 'Client billing.' }),
    repo('fork', { parent: { full_name: 'other/fork' } }),
  ] } },
  '/repositories/acme/shop/commits': { body: { values: [commit('2024-03-01T00:00:00Z', 'Jane Doe'), commit('2023-03-01T00:00:00Z', 'Jane Doe'), commit('2024-01-01T00:00:00Z', 'Someone Else')] } },
  '/repositories/acme/notes/commits': { body: { values: [commit('2023-06-01T00:00:00Z', 'jane doe')] } },
  ...more,
});

test('parseBitbucket reads slugs and URLs; languages are spelled properly', () => {
  assert.equal(parseBitbucket('@acme'), 'acme');
  assert.equal(parseBitbucket('https://bitbucket.org/acme/shop/src/main'), 'acme');
  assert.equal(parseBitbucket('bitbucket.org/acme'), 'acme');
  assert.equal(prettyLanguage('javascript'), 'JavaScript');
  assert.equal(prettyLanguage('python'), 'Python');
});

test('builds a draft from public data without a token', async () => {
  const calls = mockFetch(routes());
  const { profile, notes } = await importBitbucket('bitbucket.org/acme');
  assert.ok(calls.every((c) => c.url.startsWith('https://api.bitbucket.org/2.0/') && !c.auth));
  assert.equal(profile.handle, 'acme');
  assert.equal(profile.profile.name, 'Jane Doe');
  assert.equal(profile.profile.links?.bitbucket, 'https://bitbucket.org/acme/');
  assert.deepEqual(profile.projects?.map((p) => p.title), ['shop', 'vault', 'notes'], 'described and busy first, no forks');
  const shop = profile.projects![0];
  assert.deepEqual([shop.url, shop.live, shop.impact, shop.stack], ['https://bitbucket.org/acme/shop', 'https://shop.example.com', ['2 commits'], ['JavaScript']]);
  assert.deepEqual(profile.contributions?.map((c) => [c.year, c.public, c.private]), [[2024, 1, 0], [2023, 2, 0]], 'only their commits, matched by name');
  assert.deepEqual(profile.platforms?.[0], { name: 'Bitbucket', kind: 'public', repos: 4, commits: 3 });
  assert.deepEqual(profile.skills?.Languages, ['JavaScript', 'Python', 'PHP']);
  assert.ok(notes.some((n) => /token/.test(n)));
});

test('private repositories keep no link; a token with an email is Basic auth and matches by account', async () => {
  const calls = mockFetch(routes({
    '/user': { body: { account_id: 'me-1', display_name: 'Jane D.' } },
    '/repositories/acme/vault/commits': { body: { values: [commit('2022-02-01T00:00:00Z', 'J', 'me-1'), commit('2022-02-02T00:00:00Z', 'Jane Doe', 'other')] } },
  }));
  const { profile } = await importBitbucket('acme', { email: 'jane@example.com', token: 'tok' });
  assert.ok(calls.every((c) => c.auth === `Basic ${btoa('jane@example.com:tok')}`));
  const vault = profile.projects!.find((p) => p.title === 'vault')!;
  assert.equal(vault.visibility, 'private');
  assert.equal(vault.url, undefined);
  assert.equal(vault.live, undefined);
  assert.deepEqual(profile.contributions, [{ year: 2022, public: 0, private: 1, verified: true }], 'by account, not by name');
  assert.equal(profile.profile.name, 'Jane D.');

  const bearer = mockFetch(routes());
  await importBitbucket('acme', { token: 'ws-token' });
  assert.ok(bearer.every((c) => c.auth === 'Bearer ws-token'));
});

test('merge keeps the handle, other platforms, NDA work and yearly counts', async () => {
  mockFetch(routes());
  const base = {
    ...blankProfile(),
    handle: 'jane',
    profile: { ...blankProfile().profile, name: 'Jane Q. Doe', links: { github: 'https://github.com/jane' } },
    contributions: [{ year: 2024, public: 500, private: 100 }],
    platforms: [{ name: 'GitHub', kind: 'public' as const, repos: 9, commits: 500 }],
    skills: { Languages: ['Go'], Tools: ['Docker'] },
    projects: [
      { title: 'Secret', year: 2024, visibility: 'nda' as const, blurb: 'y' },
      { title: 'old-bb', year: 2020, visibility: 'public' as const, blurb: 'gone', url: 'https://bitbucket.org/acme/old-bb' },
    ],
  };
  const { profile } = await importBitbucket('acme', { base });
  assert.equal(profile.handle, 'jane');
  assert.equal(profile.profile.name, 'Jane Q. Doe');
  assert.equal(profile.profile.links?.github, 'https://github.com/jane');
  assert.deepEqual(profile.contributions, base.contributions);
  assert.deepEqual(profile.platforms?.map((p) => p.name), ['Bitbucket', 'GitHub']);
  assert.deepEqual(profile.projects?.map((p) => p.title), ['shop', 'vault', 'notes', 'Secret'], 'old Bitbucket repos are refreshed');
  assert.deepEqual(profile.skills, { Languages: ['Go', 'JavaScript', 'Python', 'PHP'], Tools: ['Docker'] });
});

test('errors are readable', async () => {
  mockFetch({});
  await assert.rejects(importBitbucket('nobody'), (e) => e instanceof BitbucketImportError && /No Bitbucket workspace “nobody”/.test(e.message));
  await assert.rejects(importBitbucket('not a slug!'), /doesn’t look like/);
  mockFetch({ '/workspaces/': { status: 401, body: {} } });
  await assert.rejects(importBitbucket('acme', { token: 'bad' }), /needs your Atlassian email/);
  globalThis.fetch = (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch;
  await assert.rejects(importBitbucket('acme'), /connection/);
});
