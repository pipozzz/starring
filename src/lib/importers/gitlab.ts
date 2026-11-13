// GitLab importer: public profile + projects → a Starring draft. gitlab.com or a self-hosted instance.
// Runs in the browser (GitLab's API allows cross-origin reads) and in Node 18+. Talks only to the
// instance's /api/v4.
//
// Without a token: name, public projects, the projects they contributed to (guest appearances)
// and their public activity of the last ~3 years (GitLab keeps events that long).
// With a token (read_user, or read_api for private projects): also bio, location, links and job.
// The token is used for these requests only and never stored.

import { HANDLE, blankProfile, type Contribution, type OpenSource, type Profile, type Project } from '../model';
import { isSkillTopic, prettyTopic } from './github';

export interface GitlabImport {
  profile: Profile;
  notes: string[];
}

export class GitlabImportError extends Error {}

interface GlUser { id: number; username: string; name: string; web_url: string; avatar_url?: string }
interface GlUserDetail extends GlUser {
  bio?: string; location?: string; website_url?: string; job_title?: string; organization?: string;
  twitter?: string; linkedin?: string; public_email?: string;
}
interface GlProject {
  id: number; name: string; path_with_namespace: string; description: string | null; web_url: string;
  star_count: number; forks_count: number; topics?: string[]; last_activity_at: string; archived?: boolean;
  forked_from_project?: unknown; namespace?: { path: string; kind: string };
}
interface GlEvent { project_id: number | null; action_name: string; created_at: string; push_data?: { commit_count: number } }

/** "gitlab.example.com/jane", "https://gitlab.com/jane", "@jane" → instance + username. */
export const parseGitlab = (input: string, instance = 'https://gitlab.com') => {
  const raw = input.trim().replace(/^@/, '');
  const m = /^(?:(https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,}(?::\d+)?)\/)?([^/?#\s]+)/i.exec(raw);
  const host = m?.[2] ? `https://${m[2]}` : instance.trim().replace(/\/+$/, '');
  return { instance: /^https?:\/\//.test(host) ? host : `https://${host}`, username: m?.[3] ?? '' };
};

const counted = (e: GlEvent) => (e.action_name.startsWith('pushed') ? e.push_data?.commit_count ?? 0 : 1);

export async function importGitlab(
  input: string,
  opts: { instance?: string; token?: string; base?: Profile; maxEventPages?: number } = {},
): Promise<GitlabImport> {
  const { instance, username } = parseGitlab(input, opts.instance);
  let api: URL;
  try {
    api = new URL('/api/v4', instance);
  } catch {
    throw new GitlabImportError('That doesn’t look like a GitLab address');
  }
  if (api.protocol !== 'https:' && !/^(localhost|127\.0\.0\.1)$/.test(api.hostname)) throw new GitlabImportError('Use an https:// GitLab address');
  if (!/^[a-z0-9_.-]{1,255}$/i.test(username)) throw new GitlabImportError('That doesn’t look like a GitLab username');
  const token = opts.token?.trim() || undefined;
  const selfHosted = api.hostname !== 'gitlab.com';
  const notes: string[] = [];

  const get = async <T>(path: string, soft = false): Promise<{ body: T; total?: number }> => {
    let res: Response;
    try {
      res = await fetch(`${api.href}${path}`, { headers: token ? { 'PRIVATE-TOKEN': token } : {} });
    } catch {
      throw new GitlabImportError(
        selfHosted ? `Couldn’t reach ${api.host} — it may be offline, or its admins block requests from other sites (CORS)` : 'Couldn’t reach GitLab — check your connection',
      );
    }
    if (soft && !res.ok) return { body: null as T };
    if (res.status === 401) throw new GitlabImportError('GitLab rejected the token');
    if (res.status === 429) throw new GitlabImportError('GitLab rate limit hit — try again in a minute');
    if (!res.ok) throw new GitlabImportError(`GitLab API error ${res.status}`);
    const total = Number(res.headers.get('x-total')) || undefined;
    return { body: (await res.json()) as T, total };
  };

  const [found] = (await get<GlUser[]>(`/users?username=${encodeURIComponent(username)}`)).body;
  if (!found) throw new GitlabImportError(`No GitLab user “${username}” on ${api.host}`);
  // details need a token on gitlab.com (and often on self-hosted instances)
  const detail = (await get<GlUserDetail>(`/users/${found.id}`, true)).body;
  const user: GlUserDetail = { ...found, ...(detail ?? {}) };

  const since = new Date(Date.now() - 3 * 365 * 864e5).toISOString().slice(0, 10);
  const [projects, contributed, events] = await Promise.all([
    get<GlProject[]>(`/users/${found.id}/projects?per_page=100&order_by=last_activity_at&archived=false`),
    get<GlProject[]>(`/users/${found.id}/contributed_projects?per_page=100`, true),
    (async () => {
      const all: GlEvent[] = [];
      for (let page = 1; page <= (opts.maxEventPages ?? 10); page++) {
        const { body } = await get<GlEvent[]>(`/users/${found.id}/events?per_page=100&after=${since}&page=${page}`, true);
        if (!body?.length) break;
        all.push(...body);
        if (body.length < 100) break;
      }
      return all;
    })(),
  ]);

  // ---- featured work: their own projects, best first ----
  const own = (projects.body ?? []).filter((p) => !p.forked_from_project && !p.archived);
  const toProject = (r: GlProject): Project => ({
    title: r.name,
    year: new Date(r.last_activity_at).getFullYear(),
    visibility: 'public',
    role: 'Author',
    blurb: r.description?.trim() || 'Describe what this does and why it matters.',
    impact: [
      r.star_count > 0 && `${r.star_count.toLocaleString('en')} ${r.star_count === 1 ? 'star' : 'stars'}`,
      r.forks_count > 4 && `${r.forks_count.toLocaleString('en')} forks`,
    ].filter(Boolean) as string[],
    stack: [...new Set((r.topics ?? []).filter((t) => isSkillTopic(t) && t.toLowerCase() !== r.name.toLowerCase()).slice(0, 4).map(prettyTopic))],
    url: r.web_url,
  });
  const featured = [...own].sort((a, b) => b.star_count - a.star_count || b.last_activity_at.localeCompare(a.last_activity_at)).slice(0, 6).map(toProject);

  // ---- activity: per year, and per project for guest appearances ----
  const perYear = new Map<number, number>();
  const perProject = new Map<number, { commits: number; last: string }>();
  for (const e of events) {
    const n = counted(e);
    const year = new Date(e.created_at).getFullYear();
    perYear.set(year, (perYear.get(year) ?? 0) + n);
    if (e.project_id && e.action_name.startsWith('pushed')) {
      const p = perProject.get(e.project_id) ?? { commits: 0, last: '' };
      perProject.set(e.project_id, { commits: p.commits + n, last: e.created_at > p.last ? e.created_at : p.last });
    }
  }
  const contributions: Contribution[] = [...perYear].sort((a, b) => b[0] - a[0]).map(([year, n]) => ({ year, public: n, private: 0, verified: true }));
  const commits = events.reduce((s, e) => s + (e.action_name.startsWith('pushed') ? counted(e) : 0), 0);

  // ---- guest appearances: other people's projects they contributed to ----
  const mine = found.username.toLowerCase();
  const guest: OpenSource[] = (contributed.body ?? [])
    .filter((p) => p.namespace?.path?.toLowerCase() !== mine && !p.path_with_namespace.toLowerCase().startsWith(`${mine}/`))
    .map((p) => {
      const w = perProject.get(p.id);
      return {
        repo: p.path_with_namespace,
        what: w?.commits ? `${w.commits.toLocaleString('en')} ${w.commits === 1 ? 'commit' : 'commits'}` : 'Contributor',
        kind: 'code' as const,
        url: p.web_url,
        // their year, not the project's: only when their own pushes say so
        ...(w?.last && { year: new Date(w.last).getFullYear() }),
        ...(p.star_count && { stars: p.star_count }),
      };
    })
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, 6);

  // ---- the draft ----
  const base = opts.base ?? blankProfile();
  const handle = found.username.toLowerCase();
  const site = user.website_url?.trim();
  const bio = user.bio?.trim().replace(/\s+/g, ' ') ?? '';
  const host = api.host;
  const fromHere = (u?: string) => !!u && u.includes(`//${host}/`);
  const platformName = selfHosted ? 'GitLab (self-hosted)' : 'GitLab';
  const twitter = user.twitter?.trim();
  const linkedin = user.linkedin?.trim();

  const profile: Profile = {
    ...base,
    handle: opts.base ? base.handle : HANDLE.test(handle) ? handle : base.handle,
    profile: {
      ...base.profile,
      name: user.name?.trim() || found.username,
      role: base.profile.role && base.profile.role !== 'What you do' ? base.profile.role : user.job_title?.trim() || 'Software Engineer',
      tagline: base.profile.tagline || (bio.length > 120 ? `${bio.slice(0, 117)}…` : bio),
      location: base.profile.location || user.location?.trim() || '',
      links: {
        ...base.profile.links,
        gitlab: found.web_url,
        ...(site && !base.profile.links?.website && { website: /^https?:\/\//.test(site) ? site : `https://${site}` }),
        ...(twitter && !base.profile.links?.x && { x: /^https?:\/\//.test(twitter) ? twitter : `https://x.com/${twitter.replace(/^@/, '')}` }),
        ...(linkedin && !base.profile.links?.linkedin && { linkedin: /^https?:\/\//.test(linkedin) ? linkedin : `https://www.linkedin.com/in/${linkedin}` }),
        ...(user.public_email && !base.profile.links?.email && { email: `mailto:${user.public_email}` }),
      },
    },
    // a merge keeps the yearly counts already there (GitHub's, or typed in); GitLab's go into the platform line
    contributions: opts.base && base.contributions?.some((c) => c.public || c.private) ? base.contributions : contributions,
    platforms: [
      { name: platformName, kind: 'public', repos: projects.total ?? own.length, commits },
      ...(base.platforms ?? []).filter((p) => p.name !== platformName),
    ],
    // refresh this instance's projects, keep everything else (GitHub repos, private and NDA work)
    projects: [...featured, ...(base.projects ?? []).filter((p) => !fromHere(p.url) && !featured.some((f) => f.title.toLowerCase() === p.title.toLowerCase()))],
    openSource: [...guest, ...(base.openSource ?? []).filter((o) => !guest.some((g) => g.repo.toLowerCase() === o.repo.toLowerCase()))],
    skills: {
      ...(own.length && { Topics: [...new Set(own.flatMap((r) => r.topics ?? []).filter(isSkillTopic).map(prettyTopic))].slice(0, 8) }),
      ...base.skills,
    },
  };
  if (!profile.skills?.Topics?.length && profile.skills) delete profile.skills.Topics;

  if (!detail) notes.push(`${host} only shares bio, location and links with a token — add one (read_user), or fill them in by hand.`);
  if (user.organization?.trim()) notes.push(`GitLab lists “${user.organization.trim()}” as your organisation — add it to the Timeline with dates.`);
  if (guest.length) notes.push(`Found your work in ${guest.length} other project${guest.length > 1 ? 's' : ''} — they're under Guest appearances.`);
  if (events.length) notes.push('Contribution counts come from your public GitLab activity of the last three years; add earlier years and private work by hand.');
  if (!featured.length) notes.push('No public GitLab projects to feature — add your best private or NDA work by hand.');
  return { profile, notes };
}
