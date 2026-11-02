// Weekly autodiscovery: once a week, look on GitHub for what each live stage doesn't say yet and
// keep the result, so the editor can show "3 updates" and the Monday email can mention them.
// We store the fresh import itself (not the suggestions): the editor works them out against the
// draft as it is when the owner looks (src/lib/discover.ts), so nothing goes stale.
// Reads with the owner's GitHub sign-in when they have one, else the instance's GITHUB_TOKEN for
// their GitHub link; without either it waits for the owner's own "Find updates".
// On unless DISCOVERY=false; every owner can turn it off in Account.
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import { discover } from '../lib/discover';
import { GithubImportError, importGithub, usernameFrom } from '../lib/importers/github';
import type { Profile } from '../lib/model';
import { db, schema } from './db';

const { profile, emailPref, discoveryCheck, discoveryDismissal, account } = schema;
const WEEK = 7 * 864e5;
/** Owners checked per hourly run — a full import is ~20 GitHub requests, well under 5,000/hour. */
const BATCH = 12;

export const discoveryEnabled = () => !/^(0|false|no)$/i.test(process.env.DISCOVERY ?? '');

export class NoGithub extends Error {}

const githubToken = async (userId: string) => {
  const [acc] = await db.select({ token: account.accessToken }).from(account).where(and(eq(account.userId, userId), eq(account.providerId, 'github')));
  return acc?.token ?? undefined;
};

/** Who to look up and with which token: the owner's own sign-in, else their GitHub link with the instance token. */
async function whoOnGithub(userId: string, draft: Profile, { anonymous }: { anonymous: boolean }) {
  const own = await githubToken(userId);
  if (own) {
    const me = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${own}`, Accept: 'application/vnd.github+json' } });
    if (me.ok) return { login: ((await me.json()) as { login: string }).login, source: 'account' as const, token: own };
  }
  const link = draft.profile?.links?.github;
  const login = link ? usernameFrom(link) : '';
  if (!login) throw new NoGithub('Add your GitHub link in Headliner, or sign in with GitHub, to look for updates');
  const token = process.env.GITHUB_TOKEN?.trim() || undefined;
  // GitHub's anonymous 60 requests/hour are for owners asking themselves, not for the weekly run
  if (!token && !anonymous) throw new NoGithub('Needs a GITHUB_TOKEN on this instance');
  return { login, source: 'link' as const, token };
}

export interface Check {
  login: string;
  source: string;
  found: Profile | null;
  checkedAt: Date;
  error: string | null;
  dismissed: string[];
}

/** Look on GitHub now and keep the result. Throws NoGithub or GithubImportError. */
export async function checkGithub(userId: string, draft: Profile, opts = { anonymous: true }, now = new Date()) {
  const who = await whoOnGithub(userId, draft, opts);
  const found = (await importGithub(who.login, { token: who.token })).profile;
  const row = { login: who.login, source: who.source, found, error: null, checkedAt: now };
  await db.insert(discoveryCheck).values({ userId, ...row }).onConflictDoUpdate({ target: discoveryCheck.userId, set: row });
  return row;
}

/** The owner's latest check with what they dismissed, or null if GitHub was never asked. */
export async function latestCheck(userId: string): Promise<Check | null> {
  const [row] = await db.select().from(discoveryCheck).where(eq(discoveryCheck.userId, userId));
  if (!row) return null;
  const dismissed = (await db.select({ key: discoveryDismissal.key }).from(discoveryDismissal).where(eq(discoveryDismissal.userId, userId))).map((r) => r.key);
  return { login: row.login, source: row.source, found: row.found ?? null, checkedAt: row.checkedAt, error: row.error, dismissed };
}

/** How many suggestions the latest check has for this draft. */
export async function pendingUpdates(userId: string, draft: Profile) {
  const c = await latestCheck(userId);
  return c?.found ? discover(draft, c.found, new Set(c.dismissed)).length : 0;
}

export async function setWeeklyDiscovery(userId: string, on: boolean) {
  await db.insert(emailPref).values({ userId, weeklyDiscovery: on }).onConflictDoUpdate({ target: emailPref.userId, set: { weeklyDiscovery: on, updatedAt: new Date() } });
}
export async function wantsWeeklyDiscovery(userId: string) {
  const [r] = await db.select({ on: emailPref.weeklyDiscovery }).from(emailPref).where(eq(emailPref.userId, userId));
  return r?.on ?? true;
}

// ---- the weekly run ----

/** Check every opted-in owner of a live stage whose last check is a week old — a few per run. */
export async function runDiscovery(now = new Date()) {
  const due = new Date(now.getTime() - WEEK);
  const owners = await db
    .select({ userId: profile.userId, data: profile.data })
    .from(profile)
    .leftJoin(emailPref, eq(emailPref.userId, profile.userId))
    .leftJoin(discoveryCheck, eq(discoveryCheck.userId, profile.userId))
    .where(and(eq(profile.published, true), isNull(profile.hiddenAt), sql`coalesce(${emailPref.weeklyDiscovery}, true)`, or(isNull(discoveryCheck.checkedAt), lt(discoveryCheck.checkedAt, due))))
    .orderBy(sql`${discoveryCheck.checkedAt} asc nulls first`)
    .limit(BATCH);
  let checked = 0;
  for (const o of owners) {
    // claim the owner first: another replica (or an overlapping run) skips them
    const claimed = await db
      .insert(discoveryCheck)
      .values({ userId: o.userId, login: '', source: '', checkedAt: now })
      .onConflictDoUpdate({ target: discoveryCheck.userId, set: { checkedAt: now }, setWhere: lt(discoveryCheck.checkedAt, due) })
      .returning({ userId: discoveryCheck.userId });
    if (!claimed.length) continue;
    try {
      await checkGithub(o.userId, o.data, { anonymous: false }, now);
      checked++;
    } catch (e) {
      // no GitHub to ask: try again next week. GitHub trouble: try again tomorrow.
      const retry = e instanceof NoGithub ? now : new Date(now.getTime() - WEEK + 864e5);
      await db.update(discoveryCheck).set({ error: (e as Error).message, checkedAt: retry }).where(eq(discoveryCheck.userId, o.userId));
      if (!(e instanceof NoGithub || e instanceof GithubImportError)) console.error(`[discovery] ${o.userId}: ${(e as Error).message}`);
      // a rate limit won't lift for the next owner either
      if (e instanceof GithubImportError && /rate limit/i.test(e.message)) break;
    }
  }
  return { checked, due: owners.length };
}

/** Hourly in the server process; the per-owner claim makes it safe to run on every replica. */
export function startDiscoveryScheduler() {
  const g = globalThis as unknown as { __starringDiscovery?: ReturnType<typeof setInterval> };
  if (g.__starringDiscovery || !discoveryEnabled()) return;
  const run = () => runDiscovery().then((r) => r.checked && console.log(`[discovery] checked ${r.checked} stage(s) on GitHub`)).catch((e) => console.error('[discovery]', e.message));
  g.__starringDiscovery = setInterval(run, 3600e3);
  g.__starringDiscovery.unref?.();
  setTimeout(run, 120e3).unref?.();
}
