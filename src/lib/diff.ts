// What changed between the live stage and the draft, in words a person would use:
// "Timeline: added Pipoline — Founder", "Numbers: 2026 public 0 → 2,932". Shown before publishing.

import type { Profile } from './model';

export interface ChangeGroup {
  /** The editor section, as the nav names it. */
  section: string;
  /** Matches the editor's section id, so the review can jump there. */
  id: string;
  items: string[];
}

type Row = Record<string, unknown>;
const json = (v: unknown) => JSON.stringify(v ?? null);
const n = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('en') : String(v ?? '—'));
const short = (v: unknown, max = 40) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

/** Field-level changes of one list item, e.g. "blurb, impact". */
const changedFields = (a: Row, b: Row) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => json(a[k]) !== json(b[k]));

/** Added / removed / changed items of a list, matched by `key`. */
function list(beforeList: readonly object[] | undefined, afterList: readonly object[] | undefined, key: (x: Row) => string, label: (x: Row) => string): string[] {
  const out: string[] = [];
  const before = (beforeList ?? []) as Row[];
  const after = (afterList ?? []) as Row[];
  const old = new Map(before.map((x) => [key(x), x]));
  const now = new Map(after.map((x) => [key(x), x]));
  for (const [k, x] of now) {
    const was = old.get(k);
    if (!was) out.push(`added ${label(x)}`);
    else if (json(was) !== json(x)) out.push(`changed ${label(x)} (${changedFields(was, x).join(', ')})`);
  }
  for (const [k, x] of old) if (!now.has(k)) out.push(`removed ${label(x)}`);
  // same items in a new order
  if (!out.length && json(before.map(key)) !== json(after.map(key))) out.push('new order');
  return out;
}

const k = (...v: unknown[]) => v.map((x) => String(x ?? '').toLowerCase().trim()).join('|');
const q = (s: unknown) => `“${short(s)}”`;

export function diffProfiles(live: Profile, draft: Profile): ChangeGroup[] {
  const groups: ChangeGroup[] = [];
  const add = (section: string, id: string, items: string[]) => { if (items.length) groups.push({ section, id, items }); };
  const a = live.profile ?? ({} as Profile['profile']);
  const b = draft.profile ?? ({} as Profile['profile']);

  const hero: string[] = [];
  for (const f of ['name', 'role', 'tagline', 'location'] as const) {
    if ((a[f] ?? '') !== (b[f] ?? '')) hero.push(!a[f] ? `${f}: added ${q(b[f])}` : !b[f] ? `${f}: removed` : `${f}: ${q(a[f])} → ${q(b[f])}`);
  }
  if (!!a.available !== !!b.available) hero.push(b.available ? 'now “Available for work”' : 'no longer “Available for work”');
  if ((a.photo ?? '') !== (b.photo ?? '')) hero.push(!a.photo ? 'photo added' : !b.photo ? 'photo removed' : 'new photo');
  const la = a.links ?? {};
  const lb = b.links ?? {};
  for (const key of new Set([...Object.keys(la), ...Object.keys(lb)])) {
    if ((la[key] ?? '') !== (lb[key] ?? '')) hero.push(!la[key] ? `${key} link added` : !lb[key] ? `${key} link removed` : `${key} link changed`);
  }
  if ((live.theme ?? '') !== (draft.theme ?? '')) hero.push(`theme: ${live.theme ?? 'default'} → ${draft.theme ?? 'default'}`);
  if (json(live.analytics) !== json(draft.analytics)) hero.push('analytics settings changed');
  add('Headliner', 'profile', hero);

  const years = new Map((live.contributions ?? []).map((c) => [c.year, c]));
  const numbers: string[] = [];
  for (const c of draft.contributions ?? []) {
    const was = years.get(c.year);
    years.delete(c.year);
    if (!was) numbers.push(`${c.year}: added (public ${n(c.public)}, private ${n(c.private)})`);
    else {
      if (was.public !== c.public) numbers.push(`${c.year} public: ${n(was.public)} → ${n(c.public)}`);
      if (was.private !== c.private) numbers.push(`${c.year} private: ${n(was.private)} → ${n(c.private)}`);
    }
  }
  for (const y of years.keys()) numbers.push(`${y}: removed`);
  if (json(live.activity) !== json(draft.activity)) {
    const days = Object.keys(draft.activity ?? {}).length;
    numbers.push(days ? `heatmap updated (${n(days)} active days)` : 'heatmap removed');
  }
  add('Numbers', 'contributions', numbers);

  add('Clients', 'clients', list(live.clients, draft.clients, (x) => k(x.name), (x) => String(x.name)));
  add('Timeline', 'experience', list(live.experience, draft.experience, (x) => k(x.company, x.role), (x) => `${x.company} — ${x.role}`));
  add('Featured work', 'projects', list(live.projects, draft.projects, (x) => k(x.title), (x) => q(x.title)));
  add('Guest appearances', 'openSource', list(live.openSource, draft.openSource, (x) => k(x.repo), (x) => String(x.repo)));
  add('Accolades', 'awards', [
    ...list(live.awards, draft.awards, (x) => k(x.title), (x) => q(x.title)),
    ...list(live.certifications, draft.certifications, (x) => k(x.name), (x) => `certification ${q(x.name)}`),
  ]);
  add('Press tour', 'talks', list(live.talks, draft.talks, (x) => k(x.title), (x) => q(x.title)));
  add('Platforms', 'platforms', list(live.platforms, draft.platforms, (x) => k(x.name, x.kind), (x) => String(x.name)));
  add('Education', 'education', list(live.education, draft.education, (x) => k(x.school, x.degree), (x) => String(x.school)));

  const groupsA = live.skills ?? {};
  const groupsB = draft.skills ?? {};
  const skills: string[] = [];
  for (const g of new Set([...Object.keys(groupsA), ...Object.keys(groupsB)])) {
    const x = groupsA[g] ?? [];
    const y = groupsB[g] ?? [];
    if (!groupsA[g]) skills.push(`added ${g}: ${y.join(', ')}`);
    else if (!groupsB[g]) skills.push(`removed ${g}`);
    else {
      const plus = y.filter((s) => !x.includes(s));
      const minus = x.filter((s) => !y.includes(s));
      if (plus.length || minus.length) skills.push(`${g}: ${[plus.length && `+ ${plus.join(', ')}`, minus.length && `− ${minus.join(', ')}`].filter(Boolean).join('; ')}`);
    }
  }
  skills.push(...list(live.languages, draft.languages, (x) => k(x.name), (x) => `language ${x.name}`));
  add('Skills & languages', 'skills', skills);
  add('Behind the scenes', 'interests', list(live.interests, draft.interests, (x) => k(x.name), (x) => String(x.name)));
  add('The critics', 'testimonials', list(live.testimonials, draft.testimonials, (x) => k(x.name, short(x.quote, 30)), (x) => `quote from ${x.name}`));
  return groups;
}

/** How many separate changes, for "4 unpublished changes". */
export const countChanges = (groups: ChangeGroup[]) => groups.reduce((s, g) => s + g.items.length, 0);
