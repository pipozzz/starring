// A CV / résumé / pasted text, read by an LLM on the server (src/server/cv-import.ts), arrives
// here as a CvDraft: plain data in the shape of the JSON schema the model had to follow.
// This module turns it into a Starring profile — cleaned, clipped and validated — and merges
// it into the current draft like the other importers. Runs in the browser and in Node.

import { HANDLE, THIS_YEAR, blankProfile, validate, type Client, type Profile, type TalkKind } from '../model';

type N<T> = T | null;
export interface CvDraft {
  name: N<string>;
  role: N<string>;
  tagline: N<string>;
  location: N<string>;
  links: { github: N<string>; gitlab: N<string>; linkedin: N<string>; website: N<string>; x: N<string>; email: N<string> };
  experience: { company: string; role: string; from: N<number>; to: N<number>; current: boolean; summary: N<string>; clients: string[]; stack: string[] }[];
  clients: { name: string; sector: N<string> }[];
  projects: { title: string; client: N<string>; year: N<number>; role: N<string>; blurb: string; impact: string[]; stack: string[]; url: N<string>; confidential: boolean }[];
  education: { school: string; degree: N<string>; from: N<number>; to: N<number> }[];
  skills: { group: string; items: string[] }[];
  awards: { title: string; by: N<string>; year: N<number> }[];
  certifications: { name: string; issuer: N<string>; year: N<number> }[];
  talks: { title: string; kind: TalkKind; venue: N<string>; year: N<number>; url: N<string> }[];
  languages: { name: string; level: N<string> }[];
  interests: { name: string; note: N<string> }[];
  openSource: { project: string; what: string; url: N<string>; year: N<number> }[];
}

const s = (v: unknown, max: number) => {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};
const yr = (v: unknown) => (Number.isInteger(v) && (v as number) >= 1950 && (v as number) <= THIS_YEAR + 1 ? (v as number) : undefined);
const web = (v: unknown) => {
  const t = s(v, 300);
  if (!t) return undefined;
  const u = /^https?:\/\//i.test(t) ? t : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) ? `https://${t}` : undefined;
  try { return u && new URL(u).href.replace(/\/$/, ''); } catch { return undefined; }
};
const list = (v: unknown, max = 12, len = 40) => [...new Set((Array.isArray(v) ? v : []).map((x) => s(x, len)).filter(Boolean) as string[])].slice(0, max);
const arr = <T,>(v: unknown, max: number): Partial<T>[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Partial<T>[]).slice(0, max) : []);
const KINDS = new Set<TalkKind>(['talk', 'article', 'podcast', 'video', 'book']);

/** CvDraft → Profile (sections only filled when the CV had them). Never trusts the model's shape. */
export function cvToProfile(d: Partial<CvDraft>): { profile: Profile; notes: string[] } {
  const p = blankProfile();
  const links = (d.links ?? {}) as Partial<CvDraft['links']>;
  const email = s(links.email, 120);
  p.profile = {
    ...p.profile,
    name: s(d.name, 80) ?? p.profile.name,
    role: s(d.role, 80) ?? p.profile.role,
    tagline: s(d.tagline, 120) ?? '',
    location: s(d.location, 60) ?? '',
    links: Object.fromEntries(
      [
        ['github', web(links.github)], ['gitlab', web(links.gitlab)], ['linkedin', web(links.linkedin)], ['website', web(links.website)], ['x', web(links.x)],
        ['email', email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? `mailto:${email.replace(/^mailto:/i, '')}` : undefined],
      ].filter(([, v]) => v),
    ),
  };
  const handle = /github\.com\/([A-Za-z0-9-]{2,39})/.exec(p.profile.links?.github ?? '')?.[1]?.toLowerCase();
  if (handle && HANDLE.test(handle)) p.handle = handle;

  p.experience = arr<CvDraft['experience'][number]>(d.experience, 20).flatMap((e) => {
    const company = s(e.company, 80), role = s(e.role, 80);
    if (!company || !role) return [];
    const from = yr(e.from) ?? yr(e.to) ?? THIS_YEAR;
    const to = e.current ? null : yr(e.to) ?? null;
    return [{ company, role, from, to: to !== null && to < from ? from : to, summary: s(e.summary, 200), clients: list(e.clients, 8, 60), stack: list(e.stack, 10) }];
  });
  const fromRoles = p.experience.flatMap((e) => e.clients ?? []);
  const clients: Client[] = arr<CvDraft['clients'][number]>(d.clients, 30).flatMap((c) => (s(c.name, 60) ? [{ name: s(c.name, 60)!, ...(s(c.sector, 40) && { sector: s(c.sector, 40) }) }] : []));
  // every client named under a role should also be on the client wall
  for (const name of fromRoles) if (!clients.some((c) => c.name.toLowerCase() === name.toLowerCase())) clients.push({ name });
  p.clients = clients.slice(0, 30);

  p.projects = arr<CvDraft['projects'][number]>(d.projects, 12).flatMap((x) => {
    const title = s(x.title, 80), blurb = s(x.blurb, 180);
    if (!title || !blurb) return [];
    const url = web(x.url);
    const visibility = x.confidential ? ('nda' as const) : url && /github\.com|gitlab\.com|codeberg\.org/.test(url) ? ('public' as const) : ('private' as const);
    return [{
      title, blurb, visibility, year: yr(x.year) ?? THIS_YEAR,
      ...(s(x.client, 60) && { client: s(x.client, 60) }), ...(s(x.role, 60) && { role: s(x.role, 60) }),
      impact: list(x.impact, 4, 40), stack: list(x.stack, 8),
      ...(url && (visibility === 'public' ? { url } : visibility === 'private' ? { live: url } : {})),
    }];
  });
  p.education = arr<CvDraft['education'][number]>(d.education, 8).flatMap((e) => {
    const school = s(e.school, 100);
    if (!school) return [];
    const to = yr(e.to) ?? yr(e.from) ?? THIS_YEAR;
    return [{ school, degree: s(e.degree, 120) ?? '', from: Math.min(yr(e.from) ?? to, to), to }];
  });
  p.skills = Object.fromEntries(
    arr<CvDraft['skills'][number]>(d.skills, 8).flatMap((g) => (s(g.group, 30) && list(g.items, 16).length ? [[s(g.group, 30)!, list(g.items, 16)]] : [])),
  );
  p.awards = arr<CvDraft['awards'][number]>(d.awards, 10).flatMap((a) => (s(a.title, 100) ? [{ title: s(a.title, 100)!, ...(s(a.by, 80) && { by: s(a.by, 80) }), ...(yr(a.year) && { year: yr(a.year) }) }] : []));
  p.certifications = arr<CvDraft['certifications'][number]>(d.certifications, 15).flatMap((c) => (s(c.name, 120) ? [{ name: s(c.name, 120)!, ...(s(c.issuer, 80) && { issuer: s(c.issuer, 80) }), ...(yr(c.year) && { year: yr(c.year) }) }] : []));
  p.talks = arr<CvDraft['talks'][number]>(d.talks, 15).flatMap((t) => (s(t.title, 140) ? [{ title: s(t.title, 140)!, kind: KINDS.has(t.kind as TalkKind) ? (t.kind as TalkKind) : 'talk', ...(s(t.venue, 80) && { venue: s(t.venue, 80) }), ...(yr(t.year) && { year: yr(t.year) }), ...(web(t.url) && { url: web(t.url) }) }] : []));
  p.languages = arr<CvDraft['languages'][number]>(d.languages, 10).flatMap((l) => (s(l.name, 40) ? [{ name: s(l.name, 40)!, ...(s(l.level, 30) && { level: s(l.level, 30) }) }] : []));
  p.openSource = arr<CvDraft['openSource'][number]>(d.openSource, 10).flatMap((o) => {
    const repo = s(o.project, 80), what = s(o.what, 120);
    if (!repo || !what) return [];
    const kind = /translat|locali[sz]|i18n/i.test(what) ? ('translation' as const) : /\bdocs?\b|documentation/i.test(what) ? ('docs' as const) : ('code' as const);
    return [{ repo, what, kind, ...(web(o.url) && { url: web(o.url) }), ...(yr(o.year) && { year: yr(o.year) }) }];
  });
  p.interests = arr<CvDraft['interests'][number]>(d.interests, 10).flatMap((x) => (s(x.name, 40) ? [{ name: s(x.name, 40)!, ...(s(x.note, 80) && { note: s(x.note, 80) }) }] : []));

  // anything still invalid is dropped rather than shown as an error the person didn't cause
  const issues = Object.keys(validate(p)).filter((k) => k !== 'handle');
  for (const k of issues) {
    const [section, index] = k.split('.');
    const items = (p as unknown as Record<string, unknown>)[section];
    if (Array.isArray(items) && /^\d+$/.test(index)) items[Number(index)] = undefined;
  }
  for (const key of ['experience', 'projects', 'education', 'awards', 'certifications', 'talks', 'languages', 'interests', 'clients', 'openSource'] as const) {
    (p as unknown as Record<string, unknown[]>)[key] = ((p[key] ?? []) as unknown[]).filter(Boolean);
  }

  const count = (n: number, one: string, many = `${one}s`) => (n ? `${n} ${n === 1 ? one : many}` : '');
  const found = [count(p.experience.length, 'role'), count(p.projects.length, 'project'), count(p.clients.length, 'client'), count(p.education.length, 'school'),
    count(Object.values(p.skills).flat().length, 'skill'), count(p.certifications.length, 'certification'), count(p.awards.length, 'award'),
    count(p.talks.length, 'talk or article', 'talks and articles'), count(p.languages.length, 'language'), count(p.interests.length, 'interest'), count(p.openSource!.length, 'open-source contribution')].filter(Boolean);
  const notes = [found.length ? `From your CV: ${found.join(', ')}.` : 'Nothing career-shaped was found in that document.'];
  if (p.projects.some((x) => x.visibility === 'nda')) notes.push('Projects your CV calls confidential are marked NDA — check what you may name.');
  notes.push('Read it through: the AI only uses what your CV says, but it can misread dates or merge roles.');
  return { profile: p, notes };
}

const key = (...v: unknown[]) => v.map((x) => String(x ?? '').toLowerCase()).join('|');
const append = <T,>(a: T[] = [], b: T[] = [], k: (x: T) => string) => {
  const seen = new Set(a.map(k));
  return [...a, ...b.filter((x) => !seen.has(k(x)) && seen.add(k(x)))];
};

/** Fresh: the CV draft replaces the profile (theme and handle kept). Merge: fills blanks, appends what's new. */
export function mergeCv(base: Profile, cv: Profile, mode: 'fresh' | 'merge'): Profile {
  if (mode === 'fresh') return { ...cv, handle: base.handle !== blankProfile().handle ? base.handle : cv.handle, theme: base.theme, activity: base.activity, contributions: base.contributions, platforms: base.platforms };
  const blank = blankProfile().profile;
  const keep = (cur: string | undefined, placeholder: string | undefined, next: string | undefined) => (cur && cur !== placeholder ? cur : next || cur || '');
  return {
    ...base,
    profile: {
      ...base.profile,
      name: keep(base.profile.name, blank.name, cv.profile.name),
      role: keep(base.profile.role, blank.role, cv.profile.role),
      tagline: keep(base.profile.tagline, '', cv.profile.tagline),
      location: keep(base.profile.location, '', cv.profile.location),
      links: { ...cv.profile.links, ...Object.fromEntries(Object.entries(base.profile.links ?? {}).filter(([, v]) => v)) },
    },
    experience: append(base.experience, cv.experience, (e) => key(e.company, e.role, e.from)),
    clients: append(base.clients, cv.clients, (c) => key(c.name)),
    projects: append(base.projects, cv.projects, (x) => key(x.title)),
    education: append(base.education, cv.education, (e) => key(e.school, e.from)),
    skills: { ...cv.skills, ...base.skills },
    awards: append(base.awards, cv.awards, (a) => key(a.title)),
    certifications: append(base.certifications, cv.certifications, (c) => key(c.name)),
    talks: append(base.talks, cv.talks, (t) => key(t.title)),
    languages: append(base.languages, cv.languages, (l) => key(l.name)),
    interests: append(base.interests, cv.interests, (x) => key(x.name)),
    openSource: append(base.openSource, cv.openSource, (o) => key(o.repo)),
  };
}
