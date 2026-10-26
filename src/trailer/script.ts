// A profile → the trailer's script: an ordered list of scenes with just the facts each one
// needs. Pure and browser-safe; the genres decide how a scene looks and sounds (in type).
// Scenes only appear when the profile has something real to say, so a sparse profile gets
// a short trailer, never an empty card.

import { activityGrid, heatmap, ossLogo, totals, type Profile } from '../lib/model';

export type Scene =
  | { kind: 'open'; privateShare: number }
  | { kind: 'stat'; value: number; suffix?: string; label: string }
  | { kind: 'heat'; year: number; total: number; grid: number[] }
  | { kind: 'clients'; names: string[] }
  | { kind: 'nda'; title: string; client?: string; impact?: string }
  | { kind: 'work'; title: string; client?: string; impact?: string }
  | { kind: 'cameos'; items: { repo: string; what: string; logo?: string; stars?: number }[] }
  | { kind: 'accolade'; title: string; by?: string; year?: number; talk?: boolean }
  | { kind: 'quote'; quote: string; name: string; role?: string }
  | { kind: 'title'; first: string; last: string; role: string; url: string; photo?: string }
  /** The end card: Starring's mark and where to make your own. */
  | { kind: 'outro'; site: string };

export type SceneKind = Scene['kind'];

/** Seconds per scene at speed 1; genres stretch or squeeze the whole thing. */
export const BASE_DURATION: Record<SceneKind, number> = {
  open: 3.2, stat: 2.1, heat: 3.4, clients: 3.6, nda: 4.2, work: 3.2, cameos: 3.4, accolade: 2.8, quote: 3.8, title: 4.6, outro: 3,
};

const clip = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

/** `site` is the Starring instance the end card points to, e.g. "starring.dev". */
export function buildScript(p: Profile, url: string, site = 'starring.dev'): Scene[] {
  const t = totals(p);
  const me = p.profile;
  const out: Scene[] = [{ kind: 'open', privateShare: t.all > 0 ? t.privateShare : 0 }];

  if (t.years > 0) out.push({ kind: 'stat', value: t.years, label: t.years === 1 ? 'year shipping' : 'years shipping' });
  if (t.all > 0) out.push({ kind: 'stat', value: t.all, label: 'commits' });
  if (t.all > 0 && t.privateShare >= 20) out.push({ kind: 'stat', value: t.privateShare, suffix: '%', label: 'never seen on GitHub' });

  const years = [...(p.contributions ?? [])].sort((a, b) => b.year - a.year);
  const latest = years.find((c) => c.public + c.private > 0);
  if (latest) {
    const total = latest.public + latest.private;
    out.push({ kind: 'heat', year: latest.year, total, grid: activityGrid(p.activity, latest.year) ?? heatmap(p.handle, latest.year, total) });
  }

  const clients = (p.clients ?? []).map((c) => c.name?.trim()).filter(Boolean) as string[];
  if (clients.length) out.push({ kind: 'clients', names: clients.slice(0, 8).map((n) => clip(n, 28)) });

  const projects = p.projects ?? [];
  const nda = projects.find((x) => x.visibility === 'nda' && x.impact?.length) ?? projects.find((x) => x.visibility === 'nda');
  const shown = projects.find((x) => x !== nda && x.impact?.length) ?? projects.find((x) => x !== nda);
  if (nda) out.push({ kind: 'nda', title: clip(nda.title, 40), client: nda.client && clip(nda.client, 30), impact: nda.impact?.[0] && clip(nda.impact[0], 32) });
  if (shown) out.push({ kind: 'work', title: clip(shown.title, 40), client: shown.client && clip(shown.client, 30), impact: shown.impact?.[0] && clip(shown.impact[0], 32) });

  const cameos = (p.openSource ?? []).filter((o) => o.repo && o.what).slice(0, 4);
  if (cameos.length) {
    out.push({ kind: 'cameos', items: cameos.map((o) => ({ repo: clip(o.repo, 30), what: clip(o.what, 44), logo: ossLogo(o), stars: o.stars })) });
  }

  const award = p.awards?.find((a) => a.title);
  const talk = p.talks?.find((x) => x.title && x.venue);
  if (award) out.push({ kind: 'accolade', title: clip(award.title, 48), by: award.by && clip(award.by, 36), year: award.year });
  else if (talk) out.push({ kind: 'accolade', title: clip(talk.title, 48), by: clip(talk.venue!, 36), year: talk.year, talk: true });

  const quote = p.testimonials?.find((x) => x.quote && x.name && x.quote.length <= 180) ?? p.testimonials?.find((x) => x.quote && x.name);
  if (quote) out.push({ kind: 'quote', quote: clip(quote.quote, 180), name: clip(quote.name, 40), role: [quote.role, quote.company].filter(Boolean).join(', ') || undefined });

  const [first, ...rest] = (me.name || p.handle).trim().split(/\s+/);
  out.push({ kind: 'title', first, last: rest.join(' '), role: clip(me.role || '', 60), url: url.replace(/^https?:\/\//, '').replace(/\/$/, ''), ...(me.photo && { photo: me.photo }) });
  out.push({ kind: 'outro', site: site.replace(/^https?:\/\//, '').replace(/\/$/, '') });
  return out;
}

export interface Timed { scene: Scene; start: number; dur: number }

/** Scenes laid out on a clock. `speed` > 1 is slower (Noir lingers). */
export function timeline(scenes: Scene[], speed = 1): { items: Timed[]; total: number } {
  let start = 0;
  const items = scenes.map((scene) => {
    const dur = BASE_DURATION[scene.kind] * speed;
    const item = { scene, start, dur };
    start += dur;
    return item;
  });
  return { items, total: start };
}

/** What's on screen at `t` seconds: the scene, its progress 0–1 and seconds into it. */
export function at(tl: { items: Timed[]; total: number }, t: number) {
  const clamped = Math.min(Math.max(t, 0), tl.total - 1e-6);
  const i = tl.items.findIndex((x) => clamped < x.start + x.dur);
  const item = tl.items[i < 0 ? tl.items.length - 1 : i];
  const s = clamped - item.start;
  return { index: i < 0 ? tl.items.length - 1 : i, scene: item.scene, s, p: s / item.dur, dur: item.dur };
}

/** The trailer as plain text: a transcript for screen readers and search engines. */
export function transcript(scenes: Scene[]): string[] {
  return scenes.flatMap((x): string[] => {
    switch (x.kind) {
      case 'open': return [];
      case 'stat': return [`${x.value.toLocaleString('en')}${x.suffix ?? ''} ${x.label}.`];
      case 'heat': return [`${x.total.toLocaleString('en')} contributions in ${x.year}.`];
      case 'clients': return [`Worked for ${x.names.join(', ')}.`];
      case 'nda': return [`${x.title}${x.client ? ` for ${x.client}` : ''}: under NDA${x.impact ? `, ${x.impact}` : ''}.`];
      case 'work': return [`${x.title}${x.client ? ` for ${x.client}` : ''}${x.impact ? `: ${x.impact}` : ''}.`];
      case 'cameos': return [`Guest appearances in ${x.items.map((i) => i.repo).join(', ')}.`];
      case 'accolade': return [`${x.talk ? 'Spoke at' : 'Winner:'} ${x.talk ? x.by : x.title}${x.talk ? `: ${x.title}` : x.by ? `, ${x.by}` : ''}.`];
      case 'quote': return [`“${x.quote}” — ${x.name}${x.role ? `, ${x.role}` : ''}.`];
      case 'title': return [`Starring ${[x.first, x.last].filter(Boolean).join(' ')}, ${x.role}. ${x.url}`];
      case 'outro': return [`Made with Starring — make your own at ${x.site}.`];
    }
  });
}
