// GitHub importer: public profile + repos → a Starring draft.
// Runs in the browser (and in Node 18+). Talks only to api.github.com.
//
// Without a token: public REST data (60 requests/hour per IP — we use up to 9).
// Merged pull requests to other people's repos become "Guest appearances".
// With a token: also exact contributions per year via GraphQL, including the
// private-contribution count GitHub exposes when "Private contributions" is on.
// The token is used for these requests only and never stored.

import { HANDLE, blankProfile, type Contribution, type OpenSource, type OssKind, type Profile, type Project } from '../model';

const API = 'https://api.github.com';

export interface GithubImport {
  profile: Profile;
  notes: string[];
}

interface GhUser {
  login: string;
  name: string | null;
  bio: string | null;
  location: string | null;
  blog: string | null;
  company: string | null;
  html_url: string;
  twitter_username: string | null;
  email: string | null;
  hireable: boolean | null;
  public_repos: number;
}

interface GhRepo {
  name: string;
  description: string | null;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  fork: boolean;
  archived: boolean;
  html_url: string;
  pushed_at: string;
}

export class GithubImportError extends Error {}

const get = async <T>(path: string, token?: string): Promise<T> => {
  const res = await fetch(API + path, {
    headers: { Accept: 'application/vnd.github+json', ...(token && { Authorization: `Bearer ${token}` }) },
  });
  if (res.status === 404) throw new GithubImportError('No GitHub user with that name');
  if (res.status === 401) throw new GithubImportError('GitHub rejected the token');
  if (res.status === 403 || res.status === 429) {
    throw new GithubImportError('GitHub rate limit hit — try again in a few minutes or add a token');
  }
  if (!res.ok) throw new GithubImportError(`GitHub API error ${res.status}`);
  return res.json() as Promise<T>;
};

/** Exact contributions per year (last 8 years) — needs a token. */
const contributions = async (login: string, token: string): Promise<Contribution[]> => {
  const yearsQ = await graphql<{ user: { contributionsCollection: { contributionYears: number[] } } }>(
    token,
    `query($login:String!){ user(login:$login){ contributionsCollection { contributionYears } } }`,
    { login },
  );
  const years = yearsQ.user.contributionsCollection.contributionYears.slice(0, 8);
  if (!years.length) return [];
  const fields = years
    .map((y) => `y${y}: contributionsCollection(from:"${y}-01-01T00:00:00Z", to:"${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } restrictedContributionsCount }`)
    .join('\n');
  const data = await graphql<{ user: Record<string, { contributionCalendar: { totalContributions: number }; restrictedContributionsCount: number }> }>(
    token,
    `query($login:String!){ user(login:$login){ ${fields} } }`,
    { login },
  );
  return years.map((year) => {
    const c = data.user[`y${year}`];
    const priv = c.restrictedContributionsCount;
    return { year, public: Math.max(0, c.contributionCalendar.totalContributions - priv), private: priv, verified: true };
  });
};

const graphql = async <T>(token: string, query: string, variables: object): Promise<T> => {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401) throw new GithubImportError('GitHub rejected the token');
  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length || !json.data) throw new GithubImportError(json.errors?.[0]?.message ?? 'GitHub GraphQL error');
  return json.data;
};

interface GhSearchPr { title: string; html_url: string; repository_url: string; closed_at: string | null; pull_request?: { merged_at: string | null } }

/** "feat(i18n): add Slovak (sk) translation" → "Add Slovak (sk) translation". */
export const prTitle = (t: string) => {
  const s = t.replace(/^\s*(\[[^\]]*\]\s*)?([a-z]+(\([^)]*\))?!?:\s*)?/i, '').trim() || t.trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const prKind = (titles: string[]): OssKind => {
  const t = titles.join(' ').toLowerCase();
  if (/\bi18n\b|translat|locali[sz]|\blocales?\b|\bl10n\b/.test(t)) return 'translation';
  if (/^docs|\bdocs?\b|readme|documentation|typo/.test(t)) return 'docs';
  return 'code';
};

/** Merged PRs to repos the user doesn't own, grouped per repo, biggest projects first. */
export const guestAppearances = async (login: string, token?: string): Promise<OpenSource[]> => {
  const q = encodeURIComponent(`is:pr is:merged author:${login} -user:${login}`);
  const found = await get<{ items: GhSearchPr[] }>(`/search/issues?q=${q}&per_page=100&sort=updated`, token).catch(() => ({ items: [] }));
  const byRepo = new Map<string, GhSearchPr[]>();
  for (const pr of found.items) {
    const repo = pr.repository_url.replace(`${API}/repos/`, '');
    byRepo.set(repo, [...(byRepo.get(repo) ?? []), pr]);
  }
  const repos = [...byRepo.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 7);
  const stars = await Promise.all(repos.map(([repo]) => get<{ stargazers_count: number; private: boolean }>(`/repos/${repo}`, token).catch(() => null)));
  return repos
    .map(([repo, prs], i): OpenSource => {
      const latest = [...prs].sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))[0];
      return {
        repo,
        what: prs.length === 1 ? prTitle(latest.title) : `${prTitle(latest.title)} and ${prs.length - 1} more`,
        kind: prKind(prs.map((x) => x.title)),
        url: prs.length === 1 ? latest.html_url : `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr is:merged author:${login}`)}`,
        year: new Date(latest.closed_at ?? Date.now()).getFullYear(),
        prs: prs.length,
        ...(stars[i]?.stargazers_count && { stars: stars[i]!.stargazers_count }),
      };
    })
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 6);
};

const top = (counts: Map<string, number>, n: number) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

/** Topics that describe the repo's status or events, not a skill. */
const NOT_SKILLS = new Set(['hacktoberfest', 'awesome', 'awesome-list', 'good-first-issue', 'help-wanted', 'open-source', 'opensource', 'first-timers-only', 'beginner-friendly']);

const prettyTopic = (t: string) => t.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const toProject = (r: GhRepo): Project => {
  const impact = [
    r.stargazers_count > 0 && `${r.stargazers_count.toLocaleString('en')} ${r.stargazers_count === 1 ? 'star' : 'stars'}`,
    r.forks_count > 4 && `${r.forks_count.toLocaleString('en')} forks`,
  ].filter(Boolean) as string[];
  return {
    title: r.name,
    year: new Date(r.pushed_at).getFullYear(),
    visibility: 'public',
    role: 'Author',
    blurb: r.description?.trim() || 'Describe what this does and why it matters.',
    impact,
    stack: [...new Set([r.language, ...(r.topics ?? []).slice(0, 3).map(prettyTopic)].filter(Boolean) as string[])],
    url: r.html_url,
  };
};

export const usernameFrom = (input: string) =>
  input.trim().replace(/^@/, '').replace(/^(https?:\/\/)?(www\.)?github\.com\//i, '').split(/[/?#]/)[0];

export async function importGithub(input: string, opts: { token?: string; base?: Profile } = {}): Promise<GithubImport> {
  const login = usernameFrom(input);
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(login)) throw new GithubImportError('That doesn’t look like a GitHub username');
  const token = opts.token?.trim() || undefined;
  const notes: string[] = [];

  const [user, repos, guest] = await Promise.all([
    get<GhUser>(`/users/${login}`, token),
    get<GhRepo[]>(`/users/${login}/repos?per_page=100&sort=pushed&type=owner`, token),
    guestAppearances(login, token),
  ]);

  const own = repos.filter((r) => !r.fork && !r.archived);
  const featured = [...own]
    .sort((a, b) => b.stargazers_count - a.stargazers_count || b.pushed_at.localeCompare(a.pushed_at))
    .slice(0, 4)
    .map(toProject);

  const langs = new Map<string, number>();
  const topics = new Map<string, number>();
  own.forEach((r) => {
    if (r.language) langs.set(r.language, (langs.get(r.language) ?? 0) + 1);
    r.topics?.filter((t) => !NOT_SKILLS.has(t)).forEach((t) => topics.set(t, (topics.get(t) ?? 0) + 1));
  });

  let contribs: Contribution[] = [];
  if (token) {
    contribs = await contributions(user.login, token);
    if (contribs.length && contribs.every((c) => c.private === 0)) {
      notes.push('No private contributions reported — turn on “Include private contributions” in your GitHub profile settings, or add them by hand.');
    }
  } else {
    notes.push('Add a GitHub token to import exact yearly contributions (public + private counts).');
  }
  const commits = contribs.reduce((s, c) => s + c.public, 0);

  const base = opts.base ?? blankProfile();
  const handle = user.login.toLowerCase();
  const blog = user.blog?.trim();
  const bio = user.bio?.trim().replace(/\s+/g, ' ') ?? '';

  const profile: Profile = {
    ...base,
    handle: HANDLE.test(handle) ? handle : base.handle,
    profile: {
      ...base.profile,
      name: user.name?.trim() || user.login,
      role: base.profile.role && base.profile.role !== 'What you do' ? base.profile.role : 'Software Engineer',
      tagline: bio.length > 120 ? `${bio.slice(0, 117)}…` : bio,
      location: user.location ?? '',
      available: user.hireable ?? base.profile.available,
      links: {
        ...base.profile.links,
        github: user.html_url,
        ...(blog && { website: /^https?:\/\//.test(blog) ? blog : `https://${blog}` }),
        ...(user.twitter_username && { x: `https://x.com/${user.twitter_username}` }),
        ...(user.email && { email: `mailto:${user.email}` }),
      },
    },
    contributions: contribs.length ? contribs : base.contributions?.filter((c) => c.public || c.private) ?? [],
    platforms: [
      { name: 'GitHub', kind: 'public', repos: user.public_repos, commits },
      ...(base.platforms ?? []).filter((p) => p.name !== 'GitHub'),
    ],
    projects: [...featured, ...(base.projects ?? []).filter((p) => p.visibility !== 'public')],
    // keep what was added by hand; refresh what came from GitHub
    openSource: [...guest, ...(base.openSource ?? []).filter((o) => !guest.some((g) => g.repo.toLowerCase() === o.repo.toLowerCase()))],
    skills: {
      ...(langs.size && { Languages: top(langs, 8) }),
      ...(topics.size && { Topics: top(topics, 8).map(prettyTopic) }),
      ...base.skills,
    },
  };

  if (user.company?.trim()) notes.push(`GitHub lists “${user.company.trim().replace(/^@/, '')}” as your company — add it to the Timeline with dates.`);
  if (guest.length) notes.push(`Found merged pull requests in ${guest.length} other project${guest.length > 1 ? 's' : ''} — they're under Guest appearances. Reword what you did if the PR title doesn't say it.`);
  if (!featured.length) notes.push('No public repositories to feature yet — add your best private or NDA work by hand.');
  if (profile.profile.role === 'Software Engineer' && base.profile.role !== 'Software Engineer') {
    notes.push('Role was set to “Software Engineer” — make it yours.');
  }

  return { profile, notes };
}
