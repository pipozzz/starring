// Starring draft → JSON Resume (https://jsonresume.org/schema), the reverse of jsonresume.ts.
// Takes a stage to any JSON Resume theme or CV generator. Local only: no network, no storage.
// Confidential work stays confidential: an NDA client's name never leaves as a client, and NDA or
// private projects keep only their title, year, role, blurb, impact and stack. Employers stay
// (a CV says where you worked, as the stage does).
import type { Profile } from '../model.ts';

const SCHEMA = 'https://raw.githubusercontent.com/jsonresume/resume-schema/v1.0.0/schema.json';

/** How link keys are spelled as JSON Resume networks (the importer reads them back the same). */
const NETWORK: Record<string, string> = {
  github: 'GitHub', gitlab: 'GitLab', linkedin: 'LinkedIn', x: 'X', twitter: 'X', mastodon: 'Mastodon', bluesky: 'Bluesky',
  youtube: 'YouTube', stackoverflow: 'StackOverflow', dribbble: 'Dribbble', behance: 'Behance', devto: 'DEV', medium: 'Medium',
};
const network = (key: string) => NETWORK[key.toLowerCase()] ?? key.charAt(0).toUpperCase() + key.slice(1);

const isHttp = (u?: string) => !!u && /^https?:\/\//i.test(u);
const username = (u: string) => {
  try {
    return new URL(u).pathname.split('/').filter(Boolean).pop()?.replace(/^@/, '') ?? '';
  } catch {
    return '';
  }
};
/** "Bratislava, SK" → { city, countryCode }; anything else is the city. */
const place = (location?: string) => {
  const parts = (location ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  const last = parts[parts.length - 1];
  return /^[A-Z]{2}$/.test(last) && parts.length > 1 ? { city: parts.slice(0, -1).join(', '), countryCode: last } : { city: parts.join(', ') };
};
/** Leaves out empty strings, empty lists and undefined, so the output stays tidy. */
const tidy = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) as T;

export function exportJsonResume(p: Profile): Record<string, unknown> {
  const links = p.profile.links ?? {};
  const email = links.email?.replace(/^mailto:/i, '');
  const nda = new Set((p.clients ?? []).filter((c) => c.nda).map((c) => c.name.toLowerCase()));
  const shareable = (name?: string) => !!name && !nda.has(name.toLowerCase());

  const basics = tidy({
    name: p.profile.name,
    label: p.profile.role,
    image: isHttp(p.profile.photo) ? p.profile.photo : undefined,
    email,
    url: isHttp(links.website) ? links.website : undefined,
    summary: p.profile.tagline,
    location: place(p.profile.location),
    profiles: Object.entries(links)
      .filter(([k, v]) => k !== 'email' && k !== 'website' && isHttp(v))
      .map(([k, v]) => tidy({ network: network(k), username: username(v), url: v })),
  });

  const work = (p.experience ?? []).map((e) => {
    const [summary, ...highlights] = (e.summary ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
    return tidy({ name: e.company, position: e.role, startDate: `${e.from}`, endDate: e.to ? `${e.to}` : undefined, summary, highlights });
  });

  const education = (p.education ?? []).map((e) => {
    const [studyType, ...area] = e.degree.split(' · ');
    return tidy({ institution: e.school, ...(area.length ? { studyType, area: area.join(' · ') } : { area: e.degree }), startDate: `${e.from}`, endDate: `${e.to}` });
  });

  const projects = (p.projects ?? []).map((x) => {
    const open = x.visibility === 'public';
    return tidy({
      name: x.title,
      description: x.blurb,
      startDate: `${x.year}`,
      roles: x.role ? [x.role] : undefined,
      highlights: x.impact,
      keywords: x.stack,
      // who it was for, and where it lives, only for public work for a client that isn't under NDA
      entity: open && shareable(x.client) ? x.client : undefined,
      url: open ? (isHttp(x.url) ? x.url : isHttp(x.live) ? x.live : undefined) : undefined,
    });
  });

  return tidy({
    $schema: SCHEMA,
    basics,
    work,
    education,
    projects,
    skills: Object.entries(p.skills ?? {}).map(([name, keywords]) => tidy({ name, keywords })),
    awards: (p.awards ?? []).map((a) => tidy({ title: a.title, awarder: a.by, date: a.year ? `${a.year}` : undefined, summary: a.note })),
    certificates: (p.certifications ?? []).map((c) => tidy({ name: c.name, issuer: c.issuer, date: c.year ? `${c.year}` : undefined, url: isHttp(c.url) ? c.url : undefined })),
    publications: (p.talks ?? []).map((t) => tidy({ name: t.title, publisher: t.venue, releaseDate: t.year ? `${t.year}` : undefined, url: isHttp(t.url) ? t.url : undefined })),
    languages: (p.languages ?? []).map((l) => tidy({ language: l.name, fluency: l.level })),
    interests: (p.interests ?? []).map((i) => tidy({ name: i.name, keywords: i.note?.split(',').map((s) => s.trim()).filter(Boolean) })),
    references: (p.testimonials ?? []).map((t) => tidy({ name: t.name, reference: t.quote })),
    meta: { version: 'v1.0.0' },
  });
}
