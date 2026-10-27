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

/** 'public' | 'private' | 'unknown' (the host didn't say: rate limit, network) for one repo. */
async function ask({ host, path }, { fetch, token }) {
  const get = (url, headers = {}) => fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'starring-cli', ...headers }, signal: AbortSignal.timeout(10_000) });
  try {
    if (host === 'github.com') {
      const res = await get(`https://api.github.com/repos/${path}`, token ? { Authorization: `Bearer ${token}` } : {});
      if (res.status === 404) return 'private';
      if (!res.ok) return 'unknown';
      return (await res.json()).private ? 'private' : 'public';
    }
    if (host === 'gitlab.com') {
      const res = await get(`https://gitlab.com/api/v4/projects/${encodeURIComponent(path)}`);
      if (res.status === 404 || res.status === 401) return 'private';
      if (!res.ok) return 'unknown';
      return (await res.json()).visibility === 'public' ? 'public' : 'private';
    }
    if (host === 'codeberg.org') {
      const res = await get(`https://codeberg.org/api/v1/repos/${path}`);
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
 * repos → Map(repo dir → 'public' | 'private' | 'unknown'). `remoteUrl(repo)` gives each repo's
 * origin URL. Clones of the same remote are asked about once.
 */
export async function checkVisibility(repos, { remoteUrl, fetch = globalThis.fetch, token, concurrency = 6 } = {}) {
  const out = new Map();
  const asked = new Map();
  const queue = [...repos];
  const worker = async () => {
    while (queue.length) {
      const repo = queue.shift();
      const remote = remoteRepo(remoteUrl(repo));
      if (!remote || !PUBLIC_HOSTS.includes(remote.host)) { out.set(repo, 'private'); continue; }
      const key = `${remote.host}/${remote.path.toLowerCase()}`;
      if (!asked.has(key)) asked.set(key, ask(remote, { fetch, token }));
      out.set(repo, await asked.get(key));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, repos.length) }, worker));
  return out;
}
