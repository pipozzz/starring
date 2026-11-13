// Bitbucket importer: a workspace's repositories → a Starring draft.
// Runs in the browser (Bitbucket's API allows cross-origin reads) and in Node 18+. Talks only to
// api.bitbucket.org.
//
// Without a token: the workspace name, its public repositories and the languages they use.
// With a token: private repositories too (listed as private work, with no link), and commits per
// year are counted as yours by your account rather than by name. Two kinds of token work:
// an Atlassian API token with your Atlassian email (sent as Basic auth), or a workspace or
// repository access token on its own (sent as Bearer). The token is used for these requests only
// and never stored.

import { HANDLE, blankProfile, type Contribution, type Profile, type Project } from '../model';

export interface BitbucketImport {
  profile: Profile;
  notes: string[];
}

export class BitbucketImportError extends Error {}

const API = 'https://api.bitbucket.org/2.0';

interface BbWorkspace { slug: string; name: string; links: { html: { href: string } } }
interface BbRepo {
  name: string; slug: string; full_name: string; description: string; is_private: boolean; language: string;
  website?: string | null; created_on: string; updated_on: string; parent?: unknown; links: { html: { href: string } };
}
interface BbCommit { date: string; author: { raw: string; user?: { account_id?: string; nickname?: string; display_name?: string } } }
interface BbPage<T> { values: T[]; size?: number; next?: string }
interface BbUser { account_id: string; display_name: string; nickname?: string }

/** "bitbucket.org/acme", "https://bitbucket.org/acme/repo", "@acme" → the workspace slug. */
export const parseBitbucket = (input: string) => {
  const raw = input.trim().replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?bitbucket\.org\//i, '');
  return raw.split(/[/?#]/)[0] ?? '';
};

/** Bitbucket spells languages in lower case. */
const LANG: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', php: 'PHP', 'c#': 'C#', 'c++': 'C++', css: 'CSS', html: 'HTML',
  html5: 'HTML', 'objective-c': 'Objective-C', sql: 'SQL', plsql: 'PL/SQL', coffeescript: 'CoffeeScript', actionscript: 'ActionScript',
  powershell: 'PowerShell', vbnet: 'VB.NET', scss: 'SCSS', matlab: 'MATLAB', ocaml: 'OCaml', fsharp: 'F#', golang: 'Go',
};
export const prettyLanguage = (l: string) => LANG[l.toLowerCase()] ?? l.charAt(0).toUpperCase() + l.slice(1);

export async function importBitbucket(
  input: string,
  opts: { email?: string; token?: string; base?: Profile; repoPages?: number; commitRepos?: number } = {},
): Promise<BitbucketImport> {
  const workspace = parseBitbucket(input);
  if (!/^[a-z0-9_.-]{1,62}$/i.test(workspace)) throw new BitbucketImportError('That doesn’t look like a Bitbucket workspace');
  const token = opts.token?.trim() || undefined;
  const email = opts.email?.trim() || undefined;
  const auth = token ? (email ? `Basic ${btoa(`${email}:${token}`)}` : `Bearer ${token}`) : undefined;
  const notes: string[] = [];

  const get = async <T>(url: string, soft = false): Promise<T | null> => {
    let res: Response;
    try {
      res = await fetch(url.startsWith('https://') ? url : `${API}${url}`, { headers: auth ? { Authorization: auth } : {} });
    } catch {
      throw new BitbucketImportError('Couldn’t reach Bitbucket — check your connection');
    }
    if (soft && !res.ok) return null;
    if (res.status === 401) throw new BitbucketImportError(email ? 'Bitbucket rejected the email and API token' : 'Bitbucket rejected the token — an Atlassian API token needs your Atlassian email too');
    if (res.status === 404) throw new BitbucketImportError(`No Bitbucket workspace “${workspace}” (or it has no public repositories)`);
    if (res.status === 429) throw new BitbucketImportError('Bitbucket rate limit hit — try again in a minute');
    if (!res.ok) throw new BitbucketImportError(`Bitbucket API error ${res.status}`);
    return (await res.json()) as T;
  };

  const ws = await get<BbWorkspace>(`/workspaces/${encodeURIComponent(workspace)}`);
  if (!ws) throw new BitbucketImportError(`No Bitbucket workspace “${workspace}”`);
  // with a personal token we know who "you" are; a workspace access token isn't a person
  const me = auth ? await get<BbUser>('/user', true) : null;

  // ---- repositories, most recently updated first ----
  const repos: BbRepo[] = [];
  let next: string | undefined = `/repositories/${encodeURIComponent(ws.slug)}?pagelen=100&sort=-updated_on`;
  let total = 0;
  for (let page = 0; next && page < (opts.repoPages ?? 3); page++) {
    const body: BbPage<BbRepo> | null = await get<BbPage<BbRepo>>(next);
    repos.push(...(body?.values ?? []));
    total = body?.size ?? repos.length;
    next = body?.next;
  }
  const own = repos.filter((r) => !r.parent);
  const open = own.filter((r) => !r.is_private);

  // ---- commits per year in their busiest repos: theirs only ----
  const name = ws.name.trim().toLowerCase();
  const mine = (c: BbCommit) =>
    me ? c.author.user?.account_id === me.account_id
      : [c.author.user?.display_name, c.author.user?.nickname, c.author.raw.replace(/\s*<.*$/, '')].some((n) => n?.trim().toLowerCase() === name);
  const perYear = new Map<number, { public: number; private: number }>();
  const perRepo = new Map<string, number>();
  const busiest = own.slice(0, opts.commitRepos ?? 6);
  await Promise.all(busiest.map(async (r) => {
    let url: string | undefined = `/repositories/${r.full_name}/commits?pagelen=100`;
    for (let page = 0; url && page < 3; page++) {
      const body: BbPage<BbCommit> | null = await get<BbPage<BbCommit>>(url, true);
      for (const c of body?.values ?? []) {
        if (!mine(c)) continue;
        const y = new Date(c.date).getFullYear();
        const slot = perYear.get(y) ?? { public: 0, private: 0 };
        slot[r.is_private ? 'private' : 'public']++;
        perYear.set(y, slot);
        perRepo.set(r.full_name, (perRepo.get(r.full_name) ?? 0) + 1);
      }
      url = body?.next;
    }
  }));
  const contributions: Contribution[] = [...perYear].sort((a, b) => b[0] - a[0]).map(([year, n]) => ({ year, ...n, verified: true }));
  const commits = [...perRepo.values()].reduce((s, n) => s + n, 0);

  // ---- featured work: described, busy, recent ----
  const toProject = (r: BbRepo): Project => {
    const n = perRepo.get(r.full_name);
    return {
      title: r.name,
      year: new Date(r.updated_on).getFullYear(),
      visibility: r.is_private ? 'private' : 'public',
      role: 'Author',
      blurb: r.description?.trim() || 'Describe what this does and why it matters.',
      impact: n ? [`${n.toLocaleString('en')} ${n === 1 ? 'commit' : 'commits'}`] : [],
      stack: r.language ? [prettyLanguage(r.language)] : [],
      // private code stays private: no link to it
      ...(!r.is_private && { url: r.links.html.href }),
      ...(r.website && /^https:\/\//.test(r.website) && !r.is_private && { live: r.website }),
    };
  };
  const score = (r: BbRepo) => (perRepo.get(r.full_name) ?? 0) + (r.description?.trim() ? 50 : 0);
  const featured = [...own].sort((a, b) => score(b) - score(a) || b.updated_on.localeCompare(a.updated_on)).slice(0, 6).map(toProject);

  const langs = new Map<string, number>();
  for (const r of own) if (r.language) langs.set(prettyLanguage(r.language), (langs.get(prettyLanguage(r.language)) ?? 0) + 1);
  const languages = [...langs].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l]) => l);

  // ---- the draft ----
  const base = opts.base ?? blankProfile();
  const handle = ws.slug.toLowerCase();
  const fromBitbucket = (u?: string) => !!u && /\/\/bitbucket\.org\//i.test(u);
  const profile: Profile = {
    ...base,
    handle: opts.base ? base.handle : HANDLE.test(handle) ? handle : base.handle,
    profile: {
      ...base.profile,
      name: opts.base && base.profile.name !== 'Your Name' ? base.profile.name : me?.display_name || ws.name || ws.slug,
      links: { ...base.profile.links, bitbucket: ws.links.html.href },
    },
    // a merge keeps the yearly counts already there; Bitbucket's go into the platform line
    contributions: opts.base && base.contributions?.some((c) => c.public || c.private) ? base.contributions : contributions,
    platforms: [
      { name: 'Bitbucket', kind: open.length >= own.length / 2 ? 'public' : 'private', repos: total, commits },
      ...(base.platforms ?? []).filter((p) => p.name !== 'Bitbucket'),
    ],
    // refresh Bitbucket's projects, keep everything else (GitHub, GitLab, NDA work, typed in)
    projects: [
      ...featured,
      ...(base.projects ?? []).filter((p) => !fromBitbucket(p.url) && !featured.some((f) => f.title.toLowerCase() === p.title.toLowerCase())),
    ],
    skills: {
      ...(languages.length && { Languages: [...new Set([...(base.skills?.Languages ?? []), ...languages])].slice(0, 10) }),
      ...Object.fromEntries(Object.entries(base.skills ?? {}).filter(([k]) => k !== 'Languages')),
    },
  };
  if (!profile.skills?.Languages?.length && profile.skills) delete profile.skills.Languages;

  if (!auth) notes.push('Only public repositories were read — add a token to include private ones (listed as private work, with no link).');
  else if (!me) notes.push('A workspace token can’t tell which commits are yours — commits were matched by the workspace name. Use an Atlassian API token with your email to count exactly yours.');
  if (!featured.length) notes.push('No repositories to feature — add your best work by hand.');
  if (busiest.length && !commits) notes.push('No commits matched you in the busiest repositories — add yearly numbers by hand, or use `starring scan`.');
  else if (commits) notes.push(`Counted your commits in the ${busiest.length} most recently updated repositories; add older years and other work by hand.`);
  notes.push('Bitbucket has no profile bio, location or role — fill those in.');
  return { profile, notes };
}
