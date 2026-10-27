// Which repos are public — only with `starring scan --check-public`.
// For repos on github.com, gitlab.com and codeberg.org, asks the host's public API once per
// repo, without logging in (or with GITHUB_TOKEN, for private repos and a higher rate limit).
// The host already knows the repo's name; nothing about your commits is sent. Repos anywhere
// else, and any the host won't answer for, count as private.

/** `git@github.com:me/x.git`, `https://user@github.com/me/x`, `ssh://git@host:22/me/x.git` → { host, path }. */
export function remoteRepo(url) {
  const u = (url ?? '').trim();
  const m = /^[^@/\s]+@([^:/\s]+):(.+)$/.exec(u) ?? /^\w+(?:\+\w+)?:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/.exec(u);
  if (!m) return null;
  const path = m[2].replace(/\.git\/?$/, '').replace(/\/+$/, '');
  return path ? { host: m[1].toLowerCase(), path } : null;
}

export const PUBLIC_HOSTS = ['github.com', 'gitlab.com', 'codeberg.org'];

/** A host said "too many requests": seconds-since-epoch when it resets, if it told us. */
const rateLimited = (res) => {
  if (res.status !== 403 && res.status !== 429) return null;
  const remaining = res.headers.get('x-ratelimit-remaining') ?? res.headers.get('ratelimit-remaining');
  // a plain "forbidden" isn't a limit; GitHub's secondary limit sends retry-after instead
  if (res.status === 403 && remaining !== '0' && !res.headers.get('retry-after')) return null;
  const reset = Number(res.headers.get('x-ratelimit-reset') ?? res.headers.get('ratelimit-reset'));
  const retry = Number(res.headers.get('retry-after'));
  return { resetAt: reset > 1e9 ? reset * 1000 : retry ? Date.now() + retry * 1000 : null };
};

/**
 * 'public' | 'private' | 'unknown' (the host didn't say: network, odd answer) for one repo,
 * or { limited } when the host's rate limit is used up.
 */
async function ask({ host, path }, { fetch, token }) {
  const get = (url, headers = {}) => fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'starring-cli', ...headers }, signal: AbortSignal.timeout(10_000) });
  try {
    if (host === 'github.com') {
      const res = await get(`https://api.github.com/repos/${path}`, token ? { Authorization: `Bearer ${token}` } : {});
      const limited = rateLimited(res);
      if (limited) return { limited };
      if (res.status === 404) return 'private';
      if (!res.ok) return 'unknown';
      return (await res.json()).private ? 'private' : 'public';
    }
    if (host === 'gitlab.com') {
      const res = await get(`https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`);
      const limited = rateLimited(res);
      if (limited) return { limited };
      if (res.status === 404 || res.status === 401) return 'private';
      if (!res.ok) return 'unknown';
      return (await res.json()).visibility === 'public' ? 'public' : 'private';
    }
    if (host === 'codeberg.org') {
      const res = await get(`https://codeberg.org/api/v1/repos/${path}`);
      const limited = rateLimited(res);
      if (limited) return { limited };
      if (res.status === 404) return 'private';
      if (!res.ok) return 'unknown';
      return (await res.json()).private ? 'private' : 'public';
    }
  } catch {
    return 'unknown';
  }
  return 'private';
}

/**
 * repos → { visibility: Map(repo dir → 'public' | 'private' | 'unknown'), limited }.
 * `remoteUrl(repo)` gives each repo's origin URL; clones of the same remote are asked once.
 * `limited` is { host, resetAt } when a host's rate limit ran out — the answers are then
 * incomplete and shouldn't be used. Once a host says so, it isn't asked again.
 */
export async function checkVisibility(repos, { remoteUrl, fetch = globalThis.fetch, token, concurrency = 6 } = {}) {
  const out = new Map();
  const asked = new Map();
  let limited = null;
  const queue = [...repos];
  const worker = async () => {
    while (queue.length) {
      const repo = queue.shift();
      const remote = remoteRepo(remoteUrl(repo));
      if (!remote || !PUBLIC_HOSTS.includes(remote.host)) { out.set(repo, 'private'); continue; }
      if (limited?.host === remote.host) { out.set(repo, 'unknown'); continue; }
      const key = `${remote.host}/${remote.path.toLowerCase()}`;
      if (!asked.has(key)) asked.set(key, ask(remote, { fetch, token }));
      const answer = await asked.get(key);
      if (typeof answer === 'object') {
        limited ??= { host: remote.host, resetAt: answer.limited.resetAt };
        out.set(repo, 'unknown');
      } else out.set(repo, answer);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, repos.length) }, worker));
  return { visibility: out, limited };
}
