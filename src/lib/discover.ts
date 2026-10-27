// Autodiscovery: what GitHub knows that the stage doesn't say yet. Compares a fresh GitHub
// import with the owner's draft and turns the difference into small suggestions — "Add nomploy
// to Featured work", "goliash: 3 → 5 stars" — that the owner adds or dismisses one by one.
// Nothing is applied on its own: an added suggestion lands in the draft, to be published.
// Pure and browser-safe: the server finds them, the editor applies them.

import type { Contribution, OpenSource, Profile, Project } from './model';

export type Change =
  | { op: 'addProject'; project: Project }
  | { op: 'addCameo'; cameo: OpenSource }
  | { op: 'setStars'; url: string; stars: number }
  | { op: 'setCameoStars'; repo: string; stars: number }
  | { op: 'setYear'; year: number; public: number; private?: number };

export interface Suggestion {
  /** Stable id: dismissing it hides this exact suggestion for good. */
  key: string;
  /** Matches the editor section it changes. */
  section: 'projects' | 'openSource' | 'contributions';
  title: string;
  detail?: string;
  change: Change;
}

const norm = (s = '') => s.toLowerCase().replace(/\/+$/, '').replace(/\.git$/, '');
const starsIn = (impact: string[] = []) => {
  const m = impact.map((x) => /^([\d,]+)\s+stars?$/i.exec(x.trim())).find(Boolean);
  return m ? Number(m[1].replace(/,/g, '')) : undefined;
};
const starsLabel = (n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'star' : 'stars'}`;

/** `found` is a fresh GitHub import (no base); `draft` is what the owner has now. */
export function discover(draft: Profile, found: Profile, dismissed: ReadonlySet<string> = new Set()): Suggestion[] {
  const out: Suggestion[] = [];
  const projects = draft.projects ?? [];
  const known = (p: Project) => projects.find((x) => (p.url && x.url && norm(x.url) === norm(p.url)) || norm(x.title) === norm(p.title));

  for (const p of found.projects ?? []) {
    if (p.visibility !== 'public' || !p.url) continue;
    const have = known(p);
    if (!have) {
      out.push({
        key: `project:${norm(p.url)}`,
        section: 'projects',
        title: `Add “${p.title}” to Featured work`,
        detail: [p.role, p.blurb, ...(p.impact ?? [])].filter(Boolean).join(' · '),
        change: { op: 'addProject', project: p },
      });
      continue;
    }
    const now = starsIn(p.impact);
    const was = starsIn(have.impact);
    if (now !== undefined && have.url && now > (was ?? 0)) {
      out.push({
        key: `stars:${norm(have.url)}:${now}`,
        section: 'projects',
        title: `${have.title}: ${was === undefined ? 'now' : `${was.toLocaleString('en')} →`} ${starsLabel(now)}`,
        change: { op: 'setStars', url: have.url, stars: now },
      });
    }
  }

  const cameos = draft.openSource ?? [];
  for (const o of found.openSource ?? []) {
    const have = cameos.find((x) => norm(x.repo) === norm(o.repo));
    if (!have) {
      out.push({
        key: `cameo:${norm(o.repo)}`,
        section: 'openSource',
        title: `Add your work in ${o.repo} to Guest appearances`,
        detail: [o.what, o.stars ? `★ ${o.stars.toLocaleString('en')}` : '', o.year].filter(Boolean).join(' · '),
        change: { op: 'addCameo', cameo: o },
      });
    } else if (o.stars && o.stars > (have.stars ?? 0)) {
      out.push({
        key: `cameo-stars:${norm(o.repo)}:${o.stars}`,
        section: 'openSource',
        title: `${o.repo}: ${have.stars ? `★ ${have.stars.toLocaleString('en')} →` : 'now'} ★ ${o.stars.toLocaleString('en')}`,
        change: { op: 'setCameoStars', repo: o.repo, stars: o.stars },
      });
    }
  }

  // exact yearly counts only come with a GitHub token (verified); never lower what the owner has
  const years = new Map((draft.contributions ?? []).map((c) => [c.year, c]));
  for (const c of found.contributions ?? []) {
    if (!c.verified) continue;
    const have = years.get(c.year);
    if (!have || c.public > have.public) {
      out.push({
        key: `year:${c.year}:${c.public}`,
        section: 'contributions',
        title: have ? `${c.year}: ${have.public.toLocaleString('en')} → ${c.public.toLocaleString('en')} public contributions` : `Add ${c.year}: ${c.public.toLocaleString('en')} public contributions`,
        detail: 'From your GitHub contribution graph',
        change: { op: 'setYear', year: c.year, public: c.public, ...(!have && { private: c.private }) },
      });
    }
  }
  return out.filter((s) => !dismissed.has(s.key));
}

/** Apply one suggestion to the draft. */
export function applyChange(p: Profile, c: Change): Profile {
  switch (c.op) {
    case 'addProject':
      return { ...p, projects: [...(p.projects ?? []), c.project] };
    case 'addCameo':
      return { ...p, openSource: [...(p.openSource ?? []), c.cameo] };
    case 'setStars':
      return {
        ...p,
        projects: (p.projects ?? []).map((x) => {
          if (!x.url || norm(x.url) !== norm(c.url)) return x;
          const rest = (x.impact ?? []).filter((i) => starsIn([i]) === undefined);
          return { ...x, impact: [starsLabel(c.stars), ...rest].slice(0, 4) };
        }),
      };
    case 'setCameoStars':
      return { ...p, openSource: (p.openSource ?? []).map((o) => (norm(o.repo) === norm(c.repo) ? { ...o, stars: c.stars } : o)) };
    case 'setYear': {
      const list: Contribution[] = [...(p.contributions ?? [])];
      const i = list.findIndex((x) => x.year === c.year);
      if (i >= 0) list[i] = { ...list[i], public: c.public, verified: true };
      else list.push({ year: c.year, public: c.public, private: c.private ?? 0, verified: true });
      return { ...p, contributions: list.sort((a, b) => b.year - a.year) };
    }
  }
}
