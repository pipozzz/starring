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

interface GhSearchCommit { repository: { full_name: string }; commit: { author: { date: string } } }
interface GhRepoInfo {
  full_name: string; name: string; description: string | null; language: string | null; topics?: string[]; stargazers_count: number;
  private: boolean; fork: boolean; archived: boolean; html_url: string; homepage: string | null; pushed_at: string; owner: { login: string; type: string };
}

/**
 * Repos the user doesn't own but worked on — found by their merged PRs and their commits — split
 * into the user's own projects that live under an organisation (they're the top contributor:
 * "Creator") and guest appearances in other people's projects. Biggest projects first.
 */
export const otherRepos = async (login: string, token?: string): Promise<{ guest: OpenSource[]; own: { project: Project; stars: number }[] }> => {
  const not = `-user:${login}`;
  const [prs, commits] = await Promise.all([
    get<{ items: GhSearchPr[] }>(`/search/issues?q=${encodeURIComponent(`is:pr is:merged author:${login} ${not}`)}&per_page=100&sort=updated`, token).catch(() => ({ items: [] })),
    get<{ items: GhSearchCommit[] }>(`/search/commits?q=${encodeURIComponent(`author:${login} ${not}`)}&per_page=100&sort=author-date`, token).catch(() => ({ items: [] })),
  ]);
  const byRepo = new Map<string, { prs: GhSearchPr[]; commits: number; last: string }>();
  const at = (repo: string) => byRepo.get(repo) ?? (byRepo.set(repo, { prs: [], commits: 0, last: '' }), byRepo.get(repo)!);
  for (const pr of prs.items ?? []) {
    const r = at(pr.repository_url.replace(`${API}/repos/`, ''));
    r.prs.push(pr);
    if ((pr.closed_at ?? '') > r.last) r.last = pr.closed_at ?? '';
  }
  for (const c of commits.items ?? []) {
    const r = at(c.repository.full_name);
    r.commits++;
    if (c.commit.author.date > r.last) r.last = c.commit.author.date;
  }
  // every repo with a merged PR (up to 10), plus the repos with the most commits
  const entries = [...byRepo.entries()];
  const withPrs = entries.filter(([, w]) => w.prs.length).sort((a, b) => b[1].prs.length - a[1].prs.length).slice(0, 10);
  const byCommits = entries.filter(([, w]) => !w.prs.length).sort((a, b) => b[1].commits - a[1].commits).slice(0, 6);
  const candidates = [...withPrs, ...byCommits];
  const details = await Promise.all(
    candidates.map(([repo]) => Promise.all([
      get<GhRepoInfo>(`/repos/${repo}`, token).catch(() => null),
      get<{ login: string; contributions: number }[]>(`/repos/${repo}/contributors?per_page=10`, token).catch(() => []),
    ])),
  );

  const guest: OpenSource[] = [];
  const own: { project: Project; stars: number }[] = [];
  const me = login.toLowerCase();
  const peopleOf = (i: number) => (Array.isArray(details[i][1]) ? details[i][1] : []);
  const leads = (i: number) => !!details[i][0] && peopleOf(i)[0]?.login?.toLowerCase() === me;
  // organisations where the user leads at least one public, original repo are theirs (or their team's)
  const ownOrgs = new Set(candidates.filter((_, i) => leads(i) && !details[i][0]!.fork && !details[i][0]!.private).map(([repo]) => repo.split('/')[0].toLowerCase()));
  candidates.forEach(([repo, w], i) => {
    const [info] = details[i];
    // a private repo under an organisation is an employer's or a client's: never on a public page
    if (info?.private) return;
    const mine = peopleOf(i).find((p) => p.login?.toLowerCase() === me);
    // theirs: an original repo they lead, or any repo they worked on in an organisation that's theirs
    // (a fork there too: in their own org it's their copy, e.g. a website forked from a template)
    if (info && ((leads(i) && !info.fork) || (mine && ownOrgs.has(info.owner.login.toLowerCase())))) {
      own.push({ stars: info.stargazers_count, project: {
        title: info.name,
        year: new Date(info.pushed_at).getFullYear(),
        visibility: 'public',
        role: leads(i) ? 'Creator' : 'Core team',
        blurb: info.description?.trim() || `Built under ${info.owner.login}.`,
        impact: [
          info.stargazers_count > 0 && `${info.stargazers_count.toLocaleString('en')} ${info.stargazers_count === 1 ? 'star' : 'stars'}`,
          (mine?.contributions ?? 0) > 9 && `${mine!.contributions.toLocaleString('en')} commits`,
        ].filter(Boolean) as string[],
        stack: [...new Set([info.language, ...(info.topics ?? []).filter((t) => isSkillTopic(t) && !sameName(t, info)).slice(0, 3).map(prettyTopic)].filter(Boolean) as string[])],
        url: info.html_url,
        ...(info.homepage && /^https?:\/\//.test(info.homepage) && { live: info.homepage }),
      } });
      return;
    }
    const latest = [...w.prs].sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))[0];
    guest.push({
      repo,
      what: latest
        ? w.prs.length === 1 ? prTitle(latest.title) : `${prTitle(latest.title)} and ${w.prs.length - 1} more`
        : `${w.commits} ${w.commits === 1 ? 'commit' : 'commits'}`,
      kind: prKind(w.prs.map((x) => x.title)),
      url: latest
        ? w.prs.length === 1 ? latest.html_url : `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr is:merged author:${login}`)}`
        : `https://github.com/${repo}/commits?author=${encodeURIComponent(login)}`,
      year: new Date(w.last || Date.now()).getFullYear(),
      ...(w.prs.length && { prs: w.prs.length }),
      ...(info?.stargazers_count && { stars: info.stargazers_count }),
    });
  });
  const byStars = <T extends { stars?: number }>(a: T, b: T) => (b.stars ?? 0) - (a.stars ?? 0);
  return { guest: guest.sort(byStars).slice(0, 6), own };
};

/** A topic that's just the repo's or its owner's name ("nomploy" on Nomploy/nomad-packs). */
const sameName = (t: string, info: { name: string; owner: { login: string } }) => [info.name, info.owner.login].some((n) => n.toLowerCase() === t.toLowerCase());

/** Merged PRs and commits in repos the user doesn't own: guest appearances only. */
export const guestAppearances = async (login: string, token?: string) => (await otherRepos(login, token)).guest;

const top = (counts: Map<string, number>, n: number) =>
  [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

/**
 * Topics that describe the repo — its status, an event, what kind of thing it is — rather than a
 * technology someone works with. They stay out of skills and project stacks.
 */
const NOT_SKILLS = new Set([
  'hacktoberfest', 'awesome', 'awesome-list', 'good-first-issue', 'help-wanted', 'open-source', 'opensource', 'first-timers-only', 'beginner-friendly',
  'devops', 'developer-portfolio', 'portfolio', 'developer-tools', 'devtools', 'self-hosted', 'selfhosted', 'tool', 'tools', 'cli-tool',
  'app', 'application', 'web', 'website', 'webapp', 'web-app', 'project', 'side-project', 'personal-project', 'demo', 'example', 'template',
  'boilerplate', 'starter', 'library', 'framework', 'plugin', 'utility', 'utilities', 'hobby', 'learning', 'tutorial', 'homelab', 'resume', 'cv',
]);
export const isSkillTopic = (t: string) => !NOT_SKILLS.has(t.toLowerCase()) && !/-alternative$/i.test(t);

/** How technologies are spelled, where title case gets it wrong. */
const SPELLING: Record<string, string> = {
  javascript: 'JavaScript', typescript: 'TypeScript', nodejs: 'Node.js', 'node-js': 'Node.js', node: 'Node.js', nextjs: 'Next.js', 'next-js': 'Next.js',
  vuejs: 'Vue.js', nuxtjs: 'Nuxt', reactjs: 'React', github: 'GitHub', 'github-actions': 'GitHub Actions', gitlab: 'GitLab', 'gitlab-ci': 'GitLab CI',
  graphql: 'GraphQL', postgresql: 'PostgreSQL', postgres: 'Postgres', mysql: 'MySQL', mongodb: 'MongoDB', sqlite: 'SQLite', redis: 'Redis',
  macos: 'macOS', ios: 'iOS', webassembly: 'WebAssembly', wasm: 'Wasm', openai: 'OpenAI', fastapi: 'FastAPI', jquery: 'jQuery', php: 'PHP',
  devsecops: 'DevSecOps', mlops: 'MLOps', gitops: 'GitOps', terraform: 'Terraform', opentofu: 'OpenTofu', argocd: 'Argo CD', k8s: 'Kubernetes',
};
/** Words written in capitals inside a topic, e.g. aws-lambda → AWS Lambda. */
const ACRONYMS = new Set(['aws', 'gcp', 'api', 'apis', 'cli', 'ci', 'cd', 'css', 'html', 'js', 'ts', 'ui', 'ux', 'sql', 'ai', 'ml', 'llm', 'llms', 'sdk', 'ssr', 'ssg', 'pwa', 'ecs', 'eks', 'aks', 'gke', 's3', 'iam', 'json', 'yaml', 'http', 'grpc', 'rest', 'iot', 'jwt', 'oauth', 'sso', 'cdn', 'dns', 'vpn', 'ssh', 'tls', 'mcp', 'rag', 'nlp', 'gpu', 'cpu', 'orm', 'erp', 'crm', 'cms', 'ecs']);

export const prettyTopic = (t: string) => {
  const key = t.toLowerCase();
  if (SPELLING[key]) return SPELLING[key];
  return key.split('-').map((w) => SPELLING[w] ?? (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
};

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
    stack: [...new Set([r.language, ...(r.topics ?? []).filter((t) => isSkillTopic(t) && t.toLowerCase() !== r.name.toLowerCase()).slice(0, 3).map(prettyTopic)].filter(Boolean) as string[])],
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

  const [user, repos, other] = await Promise.all([
    get<GhUser>(`/users/${login}`, token),
    get<GhRepo[]>(`/users/${login}/repos?per_page=100&sort=pushed&type=owner`, token),
    otherRepos(login, token),
  ]);
  const guest = other.guest;

  const own = repos.filter((r) => !r.fork && !r.archived);
  // the user's best repos, theirs or under an organisation where they're the top contributor
  const featured = [
    ...own.map((r) => ({ project: toProject(r), stars: r.stargazers_count, pushed: r.pushed_at })),
    ...other.own.map((o) => ({ ...o, pushed: `${o.project.year}` })),
  ]
    .sort((a, b) => b.stars - a.stars || b.pushed.localeCompare(a.pushed))
    .slice(0, 6)
    .map((x) => x.project);

  const langs = new Map<string, number>();
  const topics = new Map<string, number>();
  own.forEach((r) => {
    if (r.language) langs.set(r.language, (langs.get(r.language) ?? 0) + 1);
    r.topics?.filter(isSkillTopic).forEach((t) => topics.set(t, (topics.get(t) ?? 0) + 1));
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
  if (guest.length) notes.push(`Found your work in ${guest.length} other project${guest.length > 1 ? 's' : ''} — they're under Guest appearances. Reword what you did if the PR title doesn't say it.`);
  const fromOrgs = other.own.map((o) => o.project).filter((p) => featured.includes(p)).map((p) => p.title);
  if (fromOrgs.length) notes.push(`${fromOrgs.join(', ')} ${fromOrgs.length > 1 ? 'live' : 'lives'} under an organisation, but ${fromOrgs.length > 1 ? 'they’re' : 'it’s'} yours (you're the top contributor) — added to Featured work.`);
  if (!featured.length) notes.push('No public repositories to feature yet — add your best private or NDA work by hand.');
  if (profile.profile.role === 'Software Engineer' && base.profile.role !== 'Software Engineer') {
    notes.push('Role was set to “Software Engineer” — make it yours.');
  }

  return { profile, notes };
}
