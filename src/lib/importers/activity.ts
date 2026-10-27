// `starring scan` output (starring-activity.json) → Starring profile.
// Merges counts only: per-year commits (split into public and private when the scan ran with
// --check-public), platforms, and daily activity for the heatmap.
import { blankProfile, type Contribution, type Platform, type Profile } from '../model';

export interface ActivityFile {
  kind: 'starring-activity';
  version: 1;
  totals: { commits: number; repos: number };
  /** `public` / `private` only when the scan knew which repos are public (--check-public). */
  years: { year: number; commits: number; public?: number; private?: number }[];
  days: Record<string, number>;
  platforms: { name: string; kind?: 'public' | 'private'; repos: number; commits: number }[];
}

const count = (v: unknown, path: string) => {
  if (!Number.isInteger(v) || (v as number) < 0) throw new Error(`${path} must be a whole number ≥ 0`);
  return v as number;
};

export const isActivityFile = (data: unknown): data is ActivityFile =>
  !!data && typeof data === 'object' && (data as { kind?: unknown }).kind === 'starring-activity';

/** Validate untrusted JSON and keep only the fields we use. */
export function parseActivity(data: unknown): ActivityFile {
  if (!isActivityFile(data)) throw new Error('Not a starring-activity file');
  if (data.version !== 1) throw new Error(`Unsupported activity file version ${String(data.version)} — update Starring`);
  const years = (Array.isArray(data.years) ? data.years : []).map((y, i) => {
    const year = count(y?.year, `years[${i}].year`);
    const commits = count(y?.commits, `years[${i}].commits`);
    if (y?.public === undefined && y?.private === undefined) return { year, commits };
    const pub = count(y.public, `years[${i}].public`);
    const priv = count(y.private, `years[${i}].private`);
    if (pub + priv !== commits) throw new Error(`years[${i}]: public + private must equal commits`);
    return { year, commits, public: pub, private: priv };
  });
  const rawDays = data.days && typeof data.days === 'object' ? Object.entries(data.days) : [];
  if (rawDays.length > 40 * 366) throw new Error('Too many days in activity file');
  const days: Record<string, number> = {};
  for (const [d, n] of rawDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(`days["${d}"] is not a YYYY-MM-DD date`);
    days[d] = count(n, `days["${d}"]`);
  }
  const platforms = (Array.isArray(data.platforms) ? data.platforms : []).map((p, i) => ({
    name: String(p?.name ?? '').slice(0, 80) || 'Git',
    ...(p?.kind === 'public' || p?.kind === 'private' ? { kind: p.kind } : {}),
    repos: count(p?.repos, `platforms[${i}].repos`),
    commits: count(p?.commits, `platforms[${i}].commits`),
  }));
  return { kind: 'starring-activity', version: 1, totals: { commits: count(data.totals?.commits ?? 0, 'totals.commits'), repos: count(data.totals?.repos ?? 0, 'totals.repos') }, years, days, platforms };
}

/**
 * Merge a scan into a profile.
 * - A plain scan counts as private work: each year's `private` is replaced (marked verified),
 *   `public` is kept. Its platforms are added as private.
 * - A scan with --check-public knows which commits are in public repos: `private` is replaced,
 *   and `public` becomes the larger of the profile's (e.g. from the GitHub importer) and the
 *   scan's — the same commits, so they're never added twice. Public platforms merge with the
 *   public entries already there.
 * A private scanned "GitHub" becomes "GitHub (private repos)" so it doesn't clash with the public
 * GitHub entry from the GitHub importer.
 */
export function importActivity(data: unknown, opts: { base?: Profile } = {}): { profile: Profile; notes: string[] } {
  const scan = parseActivity(data);
  const base = opts.base ?? blankProfile();
  const notes: string[] = [];

  const byYear = new Map<number, Contribution>((base.contributions ?? []).map((c) => [c.year, { ...c }]));
  const split = scan.years.some((y) => y.public !== undefined);
  for (const y of scan.years) {
    const prev = byYear.get(y.year);
    byYear.set(y.year, y.public !== undefined
      ? { year: y.year, public: Math.max(prev?.public ?? 0, y.public), private: y.private!, verified: true }
      : { year: y.year, public: prev?.public ?? 0, private: y.commits, verified: true });
  }
  const contributions = [...byYear.values()].sort((a, b) => b.year - a.year);

  const platforms: Platform[] = [...(base.platforms ?? [])];
  for (const p of scan.platforms) {
    if (p.kind === 'public') {
      const i = platforms.findIndex((x) => x.name === p.name && x.kind === 'public');
      if (i >= 0) platforms[i] = { ...platforms[i], repos: Math.max(platforms[i].repos, p.repos), commits: Math.max(platforms[i].commits, p.commits) };
      else platforms.push({ name: p.name, kind: 'public', repos: p.repos, commits: p.commits });
      continue;
    }
    const name = p.name === 'GitHub' ? 'GitHub (private repos)' : p.name;
    const i = platforms.findIndex((x) => x.name === name && x.kind === 'private');
    const entry: Platform = { name, kind: 'private', repos: p.repos, commits: p.commits };
    if (i >= 0) platforms[i] = entry;
    else platforms.push(entry);
  }

  if (split) {
    const pub = scan.years.reduce((n, y) => n + (y.public ?? 0), 0);
    notes.push(`Imported ${scan.totals.commits.toLocaleString('en')} commits from ${scan.totals.repos} local repos: ${pub.toLocaleString('en')} in public repos, ${(scan.totals.commits - pub).toLocaleString('en')} in private ones — only dates and counts.`);
  } else {
    notes.push(`Imported ${scan.totals.commits.toLocaleString('en')} commits from ${scan.totals.repos} local repos as private work — only dates and counts.`);
    if (scan.platforms.some((p) => ['GitHub', 'GitLab', 'Codeberg'].includes(p.name))) {
      notes.push('The scan counted GitHub/GitLab repos as private. If some are public, re-scan with `npx starring-cli scan --check-public` so they count as public.');
    }
  }
  return { profile: { ...base, contributions, platforms, activity: scan.days }, notes };
}
