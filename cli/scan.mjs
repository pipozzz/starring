// Scan local git repositories and count *your* commits — nothing else.
// Pure Node built-ins, no network (repo visibility, when asked for, comes from visibility.mjs).
// Used by `starring scan` and by the tests.
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const SKIP = new Set(['node_modules', '.git', 'vendor', 'dist', 'build', '.next', '.cache', 'target', 'Pods', '.venv', 'venv', '__pypackages__']);

/** Find git working trees (and bare repos) under the given roots. */
export function findRepos(roots, { maxDepth = 6 } = {}) {
  const found = new Set();
  const walk = (dir, depth) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    if (entries.some((e) => e.name === '.git')) { found.add(dir); return; } // don't descend into a repo
    if (entries.some((e) => e.name === 'HEAD' && e.isFile()) && entries.some((e) => e.name === 'objects' && e.isDirectory())) { found.add(dir); return; }
    if (depth >= maxDepth) return;
    for (const e of entries) {
      if (!e.isDirectory() || SKIP.has(e.name) || e.name.startsWith('.')) continue;
      walk(join(dir, e.name), depth + 1);
    }
  };
  for (const r of roots) {
    const abs = resolve(r.replace(/^~(?=$|\/)/, homedir()));
    try { if (statSync(abs).isDirectory()) walk(abs, 0); } catch { /* missing root: ignore */ }
  }
  return [...found].sort();
}

const git = (repo, args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });

export const defaultEmails = () => {
  try { return [execFileSync('git', ['config', '--global', 'user.email'], { encoding: 'utf8' }).trim()].filter(Boolean); } catch { return []; }
};

export function remoteUrl(repo) {
  try { return git(repo, ['remote', 'get-url', 'origin']).trim(); } catch { return ''; }
}

export function remoteHost(repo) {
  const url = remoteUrl(repo);
  if (!url) return '';
  return (/^[^@]+@([^:]+):/.exec(url) ?? /^\w+:\/\/(?:[^@/]+@)?([^/:]+)/.exec(url))?.[1]?.toLowerCase() ?? '';
}

/** Where a repo is hosted — only the kind of host, never the host name unless asked. */
export function hostKind(repo, { revealHosts = false } = {}) {
  const host = remoteHost(repo);
  if (host === 'github.com') return 'GitHub';
  if (host === 'gitlab.com') return 'GitLab';
  if (host === 'bitbucket.org') return 'Bitbucket';
  if (host.endsWith('dev.azure.com') || host.endsWith('visualstudio.com')) return 'Azure DevOps';
  if (host === 'codeberg.org') return 'Codeberg';
  if (revealHosts && host) return host;
  if (host.includes('gitlab')) return 'GitLab (self-hosted)';
  if (host.includes('gitea') || host.includes('forgejo')) return 'Gitea (self-hosted)';
  if (host.includes('bitbucket')) return 'Bitbucket (self-hosted)';
  return host ? 'Self-hosted git' : 'Local only';
}

/**
 * Count commits authored by `emails` across `repos`.
 * Commits are de-duplicated by hash, so forks and multiple clones count once.
 * Returns only aggregates: per year, per day (for the heatmap), per host kind.
 * With `visibility` (repo → 'public' | 'private' | 'unknown', from checkVisibility), years and
 * platforms are also split into public and private; unknown counts as private.
 */
export function scan(repos, { emails, since, revealHosts = false, exclude = [], coauthored = false, visibility, onRepo } = {}) {
  const wanted = new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean));
  if (!wanted.size) throw new Error('No author email: pass --email you@company.com (or set git config --global user.email)');
  const seen = new Set();
  const years = new Map();
  const days = new Map();
  const platforms = new Map();
  let counted = 0;
  const split = { public: 0, private: 0 };
  const publicByYear = new Map();
  let authored = 0;
  let coauthoredCount = 0;
  const excluded = exclude.map((e) => e.toLowerCase());
  let skipped = 0;
  for (const repo of repos) {
    if (excluded.length) {
      const host = remoteHost(repo);
      if (host && excluded.some((e) => host === e || host.endsWith(`.${e}`))) {
        skipped++;
        onRepo?.(repo, 0, `excluded (${host})`);
        continue;
      }
    }
    let out = '';
    try {
      const format = '%x1e%H%x1f%ae%x1f%aI' + (coauthored ? '%x1f%(trailers:key=Co-authored-by,valueonly)' : '');
      out = git(repo, ['log', '--all', '--no-merges', `--format=${format}`, ...(since ? [`--since=${since}`] : [])]);
    } catch {
      onRepo?.(repo, 0, 'skipped (not readable)');
      continue;
    }
    let mine = 0;
    const isPublic = visibility?.get(repo) === 'public';
    for (const record of out.split('\x1e')) {
      if (!record.trim()) continue;
      const [hash, email, date, trailerBlock] = record.split('\x1f');
      if (!hash || seen.has(hash)) continue;
      const isAuthor = wanted.has(email?.toLowerCase());
      let isCoauthor = false;
      if (!isAuthor && coauthored && trailerBlock) {
        for (const line of trailerBlock.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const trailerEmail = (/<([^>]+)>/.exec(trimmed)?.[1] ?? trimmed).toLowerCase();
          if (wanted.has(trailerEmail)) {
            isCoauthor = true;
            break;
          }
        }
      }
      if (!isAuthor && !isCoauthor) continue;
      seen.add(hash);
      mine++;
      if (isAuthor) authored++; else coauthoredCount++;
      const day = date.slice(0, 10);
      const year = Number(day.slice(0, 4));
      years.set(year, (years.get(year) ?? 0) + 1);
      days.set(day, (days.get(day) ?? 0) + 1);
      if (isPublic) publicByYear.set(year, (publicByYear.get(year) ?? 0) + 1);
    }
    if (mine) {
      counted++;
      split[isPublic ? 'public' : 'private'] += mine;
      const name = hostKind(repo, { revealHosts });
      const key = visibility ? `${name}\t${isPublic ? 'public' : 'private'}` : name;
      const p = platforms.get(key) ?? { repos: 0, commits: 0 };
      platforms.set(key, { repos: p.repos + 1, commits: p.commits + mine });
    }
    onRepo?.(repo, mine, visibility && mine ? (isPublic ? 'public' : visibility.get(repo) === 'unknown' ? 'visibility unknown, counted as private' : '') : undefined);
  }
  return {
    kind: 'starring-activity',
    version: 1,
    generatedAt: new Date().toISOString(),
    totals: {
      commits: seen.size,
      ...(coauthored ? { authored, coauthored: coauthoredCount } : {}),
      ...(visibility ? split : {}),
      repos: counted,
      reposScanned: repos.length - skipped,
      reposExcluded: skipped,
    },
    years: [...years].sort((a, b) => b[0] - a[0]).map(([year, commits]) =>
      visibility ? { year, commits, public: publicByYear.get(year) ?? 0, private: commits - (publicByYear.get(year) ?? 0) } : { year, commits }),
    days: Object.fromEntries([...days].sort()),
    platforms: [...platforms].sort((a, b) => b[1].commits - a[1].commits).map(([key, v]) => {
      const [name, kind] = key.split('\t');
      return kind ? { name, kind, ...v } : { name, ...v };
    }),
  };
}
