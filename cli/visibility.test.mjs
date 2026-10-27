import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkVisibility, remoteRepo } from './visibility.mjs';

test('remote URLs in every common form', () => {
  assert.deepEqual(remoteRepo('git@github.com:pipozzz/goliash.git'), { host: 'github.com', path: 'pipozzz/goliash' });
  assert.deepEqual(remoteRepo('https://github.com/pipozzz/starring'), { host: 'github.com', path: 'pipozzz/starring' });
  assert.deepEqual(remoteRepo('https://x-access-token:secret@github.com/me/x.git'), { host: 'github.com', path: 'me/x' }, 'credentials are dropped');
  assert.deepEqual(remoteRepo('ssh://git@gitlab.com:22/group/sub/proj.git'), { host: 'gitlab.com', path: 'group/sub/proj' });
  assert.deepEqual(remoteRepo('git+ssh://git@codeberg.org/me/thing.git/'), { host: 'codeberg.org', path: 'me/thing' });
  assert.equal(remoteRepo(''), null);
  assert.equal(remoteRepo('/srv/git/local.git'), null);
});

test('asks each host once per repo and reads its answer; elsewhere is private', async () => {
  const asked = [];
  const fetch = async (url, init) => {
    asked.push([url, init.headers.Authorization ?? null]);
    if (url.endsWith('/repos/me/open')) return Response.json({ private: false });
    if (url.endsWith('/repos/me/closed-with-token')) return Response.json({ private: true });
    if (url.endsWith('/repos/me/hidden')) return new Response('', { status: 404 });
    if (url.endsWith('/repos/me/limited')) return new Response('rate limit', { status: 403 });
    if (url.startsWith('https://gitlab.com/api/v4/projects/group%2Fpub')) return Response.json({ visibility: 'public' });
    if (url.startsWith('https://gitlab.com/api/v4/projects/group%2Finternal')) return Response.json({ visibility: 'internal' });
    if (url.startsWith('https://codeberg.org/api/v1/repos/me/free')) return Response.json({ private: false });
    throw new Error(`unexpected ${url}`);
  };
  const remotes = {
    a: 'git@github.com:me/open.git', a2: 'https://github.com/me/open', b: 'git@github.com:me/closed-with-token.git',
    c: 'git@github.com:me/hidden.git', d: 'git@github.com:me/limited.git', e: 'https://gitlab.com/group/pub.git',
    f: 'https://gitlab.com/group/internal.git', g: 'https://codeberg.org/me/free.git', h: 'git@git.acme.example:x/y.git', i: '',
  };
  const { visibility: v, limited } = await checkVisibility(Object.keys(remotes), { remoteUrl: (r) => remotes[r], fetch, token: 't0k' });
  assert.equal(limited, null, 'a plain 403 is not a rate limit');
  assert.deepEqual(Object.fromEntries(v), {
    a: 'public', a2: 'public', b: 'private', c: 'private', d: 'unknown', e: 'public', f: 'private', g: 'public', h: 'private', i: 'private',
  });
  assert.equal(asked.filter(([u]) => u.endsWith('/repos/me/open')).length, 1, 'two clones of one repo: one request');
  assert.ok(asked.filter(([u]) => u.includes('api.github.com')).every(([, auth]) => auth === 'Bearer t0k'), 'the token only goes to GitHub');
  assert.ok(asked.filter(([u]) => !u.includes('api.github.com')).every(([, auth]) => auth === null));
  assert.ok(!asked.some(([u]) => u.includes('acme')), 'self-hosted servers are never contacted');
});

test('a used-up rate limit is reported with its reset time, and that host is not asked again', async () => {
  const reset = Math.floor(Date.UTC(2026, 9, 27, 8, 43) / 1000);
  let github = 0;
  const fetch = async (url) => {
    if (url.includes('api.github.com')) {
      github++;
      return new Response('{"message":"API rate limit exceeded"}', { status: 403, headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(reset) } });
    }
    return Response.json({ visibility: 'public' });
  };
  const remotes = { a: 'git@github.com:me/a.git', b: 'git@github.com:me/b.git', c: 'git@github.com:me/c.git', d: 'https://gitlab.com/g/p.git' };
  const { visibility, limited } = await checkVisibility(Object.keys(remotes), { remoteUrl: (r) => remotes[r], fetch, concurrency: 1 });
  assert.deepEqual(limited, { host: 'github.com', resetAt: reset * 1000 });
  assert.equal(github, 1, 'stops asking GitHub after the first "too many requests"');
  assert.deepEqual(Object.fromEntries(visibility), { a: 'unknown', b: 'unknown', c: 'unknown', d: 'public' }, 'other hosts still answer');
});

test("GitHub's secondary limit (403 + retry-after) and a 429 count as rate limits too", async () => {
  const secondary = async () => new Response('', { status: 403, headers: { 'retry-after': '60' } });
  const r1 = await checkVisibility(['a'], { remoteUrl: () => 'git@github.com:me/a.git', fetch: secondary });
  assert.equal(r1.limited?.host, 'github.com');
  assert.ok(r1.limited.resetAt > Date.now());
  const tooMany = async () => new Response('', { status: 429 });
  const r2 = await checkVisibility(['a'], { remoteUrl: () => 'https://gitlab.com/g/p.git', fetch: tooMany });
  assert.deepEqual(r2.limited, { host: 'gitlab.com', resetAt: null });
});
