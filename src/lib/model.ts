// Browser-safe profile model: types, derived numbers, validation.
// Shared by the static pages and the visual editor.

export type Visibility = 'public' | 'private' | 'nda';
/** A theme id — a folder in src/themes/. */
export type Theme = string;

export interface Contribution { year: number; public: number; private: number; verified?: boolean }
export interface Platform { name: string; kind: 'public' | 'private'; repos: number; commits: number }
export interface Client { name: string; sector?: string; nda?: boolean }
export interface Experience {
  company: string;
  role: string;
  from: number;
  to: number | null;
  summary?: string;
  clients?: string[];
  stack?: string[];
}
export interface Project {
  title: string;
  client?: string;
  year: number;
  visibility: Visibility;
  role?: string;
  blurb: string;
  impact?: string[];
  stack?: string[];
  /** Source code (public projects). */
  url?: string;
  /** The running thing: a site, an app store page, a demo. Fine for NDA work that's public-facing. */
  live?: string;
  /** A screenshot or poster, https:// image URL. */
  image?: string;
}
export interface Award { title: string; by?: string; year?: number; url?: string; note?: string }
export interface Certification { name: string; issuer?: string; year?: number; url?: string }
export type TalkKind = 'talk' | 'article' | 'podcast' | 'video' | 'book';
export interface Talk { title: string; kind?: TalkKind; venue?: string; year?: number; url?: string }
export interface Language { name: string; level?: string }
export interface Interest { name: string; note?: string }
export interface Testimonial { quote: string; name: string; role?: string; company?: string; url?: string }
export interface Education { school: string; degree: string; from: number; to: number }
export type OssKind = 'code' | 'docs' | 'translation' | 'design' | 'maintainer';
/** Work in someone else's open-source project: a PR, a translation, a maintainer role. */
export interface OpenSource {
  /** "owner/name" for GitHub repos, or the project's name. */
  repo: string;
  /** What you did, in a line: "Slovak translation", "Postgres 17 support". */
  what: string;
  kind?: OssKind;
  /** The PR, your PR list, or the project. */
  url?: string;
  year?: number;
  /** Merged pull requests. */
  prs?: number;
  /** The project's stars when imported. */
  stars?: number;
  /** https:// logo; GitHub repos default to the owner's avatar. */
  logo?: string;
}

export interface Profile {
  handle: string;
  theme?: Theme;
  profile: {
    name: string;
    role: string;
    location?: string;
    tagline?: string;
    available?: boolean;
    /** Portrait, https:// (an upload on this instance, or any image address). */
    photo?: string;
    links?: Record<string, string>;
  };
  contributions?: Contribution[];
  platforms?: Platform[];
  clients?: Client[];
  experience?: Experience[];
  projects?: Project[];
  education?: Education[];
  skills?: Record<string, string[]>;
  awards?: Award[];
  certifications?: Certification[];
  /** Talks, articles, podcasts, videos, books. */
  talks?: Talk[];
  languages?: Language[];
  /** Hobbies and interests — the person behind the work. */
  interests?: Interest[];
  testimonials?: Testimonial[];
  /** Contributions to other people's open-source projects. */
  openSource?: OpenSource[];
  /** Commits per day ('YYYY-MM-DD' → n) from `starring scan` or an importer; drives the real heatmap. */
  activity?: Record<string, number>;
  /** The owner's own analytics for their profile page. */
  analytics?: { plausible?: { domain: string; host?: string } };
}


export const HANDLE = /^[a-z0-9][a-z0-9-]{1,38}$/;
/** Handles that would collide with app routes. */
export const RESERVED = ['edit', 'api', 'login', 'logout', 'settings', 'examples', 'profiles', 'assets', 'admin', 'new', 'themes', 'og', 'oembed', 'sitemap', 'robots', 'favicon', 'forgot-password', 'reset-password', 'terms', 'privacy', 'report', 'support', 'help', 'about', 'explore', '404', '500'];
export const THIS_YEAR = new Date().getFullYear();

/** Plausible site id: a domain, optionally with one path segment (starring.dev/you). */
export const PLAUSIBLE_DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[a-z0-9._-]+)?$/i;
/** An https:// Plausible address: an origin, or an origin plus the path it is served under (self-hosted). */
export const isHttpsOrigin = (v: string) => {
  try { const u = new URL(v); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
};
/** Where to send a profile's page views, or null when not configured / invalid. */
export const plausibleTarget = (p: Profile) => {
  const pl = p.analytics?.plausible;
  if (!pl?.domain || !PLAUSIBLE_DOMAIN.test(pl.domain)) return null;
  const host = pl.host?.trim() || 'https://plausible.io';
  if (!isHttpsOrigin(host)) return null;
  const u = new URL(host);
  return { domain: pl.domain.toLowerCase(), endpoint: `${u.origin}${u.pathname.replace(/\/+$/, '')}/api/event` };
};

export const blankProfile = (): Profile => ({
  handle: 'your-handle',
  theme: 'acid',
  profile: { name: 'Your Name', role: 'What you do', tagline: '', location: '', available: true, links: {} },
  contributions: [{ year: THIS_YEAR - 1, public: 0, private: 0, verified: false }],
  platforms: [],
  clients: [],
  experience: [],
  projects: [],
  education: [],
  skills: {},
});

// ---------- validation ----------

export type Issues = Record<string, string>;

/** Returns path → message, e.g. { 'projects.2.title': 'Required' }. Empty = valid. */
export const validate = (p: Profile): Issues => {
  const out: Issues = {};
  const req = (path: string, v: unknown) => {
    if (v === undefined || v === null || (typeof v === 'string' && !v.trim())) out[path] = 'Required';
  };
  if (!HANDLE.test(p.handle ?? '')) out.handle = 'Lowercase letters, digits and dashes, 2–39 chars';
  else if (RESERVED.includes(p.handle)) out.handle = 'This handle is reserved';
  req('profile.name', p.profile?.name);
  req('profile.role', p.profile?.role);
  Object.entries(p.profile?.links ?? {}).forEach(([k, v]) => {
    if (v && !/^(https?:|mailto:)/.test(v)) out[`profile.links.${k}`] = 'Must start with https:// or mailto:';
  });
  p.experience?.forEach((e, i) => {
    req(`experience.${i}.company`, e.company);
    req(`experience.${i}.role`, e.role);
    if (e.to !== null && e.to < e.from) out[`experience.${i}.to`] = 'Ends before it starts';
  });
  p.projects?.forEach((pr, i) => {
    req(`projects.${i}.title`, pr.title);
    req(`projects.${i}.blurb`, pr.blurb);
    if (pr.url && !/^https?:/.test(pr.url)) out[`projects.${i}.url`] = 'Must start with https://';
    if (pr.url && pr.visibility === 'nda') out[`projects.${i}.url`] = 'NDA projects should not link to code';
  });
  p.projects?.forEach((pr, i) => {
    if (pr.live && !/^https?:\/\//.test(pr.live)) out[`projects.${i}.live`] = 'Must start with https://';
    if (pr.image && !/^https:\/\/\S+$/.test(pr.image)) out[`projects.${i}.image`] = 'An https:// image address';
  });
  p.clients?.forEach((c, i) => req(`clients.${i}.name`, c.name));
  const link = (path: string, v?: string) => { if (v && !/^https?:\/\//.test(v)) out[path] = 'Must start with https://'; };
  const year = (path: string, v?: number) => { if (v !== undefined && v !== null && (!Number.isInteger(v) || v < 1950 || v > THIS_YEAR + 1)) out[path] = `A year between 1950 and ${THIS_YEAR + 1}`; };
  if (p.profile?.photo && !/^https?:\/\/\S+$/.test(p.profile.photo)) out['profile.photo'] = 'An https:// image address';
  p.awards?.forEach((a, i) => { req(`awards.${i}.title`, a.title); year(`awards.${i}.year`, a.year); link(`awards.${i}.url`, a.url); });
  p.certifications?.forEach((c, i) => { req(`certifications.${i}.name`, c.name); year(`certifications.${i}.year`, c.year); link(`certifications.${i}.url`, c.url); });
  p.talks?.forEach((t, i) => { req(`talks.${i}.title`, t.title); year(`talks.${i}.year`, t.year); link(`talks.${i}.url`, t.url); });
  p.languages?.forEach((l, i) => req(`languages.${i}.name`, l.name));
  p.openSource?.forEach((o, i) => {
    req(`openSource.${i}.repo`, o.repo);
    req(`openSource.${i}.what`, o.what);
    year(`openSource.${i}.year`, o.year);
    link(`openSource.${i}.url`, o.url);
    if (o.logo && !/^https:\/\/\S+$/.test(o.logo)) out[`openSource.${i}.logo`] = 'An https:// image address';
  });
  p.interests?.forEach((x, i) => req(`interests.${i}.name`, x.name));
  p.testimonials?.forEach((t, i) => {
    req(`testimonials.${i}.quote`, t.quote);
    req(`testimonials.${i}.name`, t.name);
    if ((t.quote?.length ?? 0) > 400) out[`testimonials.${i}.quote`] = 'Keep it under 400 characters — the best quotes are short';
    link(`testimonials.${i}.url`, t.url);
  });
  p.education?.forEach((e, i) => req(`education.${i}.school`, e.school));
  const pl = p.analytics?.plausible;
  if (pl && (pl.domain || pl.host)) {
    if (!PLAUSIBLE_DOMAIN.test(pl.domain ?? '')) out['analytics.plausible.domain'] = 'The site name from your Plausible dashboard, e.g. starring.dev/you or you.example.com';
    if (pl.host && !isHttpsOrigin(pl.host)) out['analytics.plausible.host'] = 'An https:// address, e.g. https://plausible.io or your self-hosted Plausible';
  }
  if (p.activity) {
    const days = Object.entries(p.activity);
    if (days.length > 40 * 366 || days.some(([d, n]) => !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isInteger(n) || n < 0)) {
      out.activity = 'Activity must map YYYY-MM-DD dates to commit counts';
    }
  }
  return out;
};

// ---------- derived numbers ----------

const GH_REPO = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/[\w.-]+$/;
/** The project's logo: the one given, else the GitHub owner's avatar when the repo is on GitHub. */
export const ossLogo = (o: OpenSource): string | undefined => {
  if (o.logo) return o.logo;
  const owner = GH_REPO.exec(o.repo?.trim() ?? '')?.[1];
  const onGithub = !o.url || /^https:\/\/github\.com\//.test(o.url);
  return owner && onGithub ? `https://avatars.githubusercontent.com/${owner}?s=96` : undefined;
};
/** The project's page: the GitHub repo for "owner/name", else the given link. */
export const ossHome = (o: OpenSource): string | undefined =>
  GH_REPO.test(o.repo?.trim() ?? '') && (!o.url || o.url.startsWith('https://github.com/')) ? `https://github.com/${o.repo.trim()}` : o.url;
/** 15091 → "15k", 1234 → "1.2k". */
export const compact = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n));

export const totals = (p: Profile) => {
  const c = p.contributions ?? [];
  const pub = c.reduce((s, y) => s + (y.public || 0), 0);
  const priv = c.reduce((s, y) => s + (y.private || 0), 0);
  const years = (p.experience ?? []).map((e) => e.from).filter(Boolean);
  const start = years.length ? Math.min(...years) : THIS_YEAR;
  return {
    public: pub,
    private: priv,
    all: pub + priv,
    privateShare: pub + priv ? Math.round((priv / (pub + priv)) * 100) : 0,
    years: THIS_YEAR - start,
    clients: p.clients?.length ?? 0,
    repos: (p.platforms ?? []).reduce((s, x) => s + (x.repos || 0), 0),
  };
};

/**
 * Real heatmap for `year` from daily counts: 53 week-columns × 7 days (Sun–Sat),
 * levels 0–4 by quartile of active days, like GitHub's. Returns null when there's
 * no activity that year.
 */
export const activityGrid = (activity: Record<string, number> | undefined, year: number): number[] | null => {
  if (!activity) return null;
  const counts: number[] = [];
  const start = new Date(Date.UTC(year, 0, 1));
  const offset = start.getUTCDay(); // empty cells before Jan 1 in the first week
  for (let d = new Date(start); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    counts.push(activity[d.toISOString().slice(0, 10)] ?? 0);
  }
  const active = counts.filter((n) => n > 0).sort((a, b) => a - b);
  if (!active.length) return null;
  const q = (f: number) => active[Math.floor((active.length - 1) * f)];
  const [q1, q2, q3] = [q(0.25), q(0.5), q(0.75)];
  const level = (n: number) => (n === 0 ? 0 : n <= q1 ? 1 : n <= q2 ? 2 : n <= q3 ? 3 : 4);
  const cells = [...Array(offset).fill(0), ...counts.map(level)];
  return [...cells, ...Array(Math.max(0, 53 * 7 - cells.length)).fill(0)].slice(0, 53 * 7);
};

/**
 * Turn a yearly total into a 53x7 heatmap. Deterministic per (handle, year)
 * so builds are stable. Used when there's no daily activity (see activityGrid).
 */
export const heatmap = (handle: string, year: number, total: number): number[] => {
  let seed = [...`${handle}${year}`].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const weights = Array.from({ length: 53 * 7 }, (_, i) => {
    const weekday = i % 7;
    const base = weekday === 0 || weekday === 6 ? 0.15 : 1;
    return rnd() < 0.12 ? 0 : base * rnd() ** 1.6;
  });
  if (!total) return weights.map(() => 0);
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const days = weights.map((w) => (w / sum) * total);
  const max = Math.max(...days) || 1;
  return days.map((d) => (d === 0 ? 0 : Math.min(4, Math.ceil((d / max) * 4))));
};
