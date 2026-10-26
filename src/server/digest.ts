// The weekly email to stage owners: last week's visitors, the trend, where they came from.
// On only when the instance has both owner stats (PLAUSIBLE_API_KEY) and SMTP; WEEKLY_DIGEST=false
// turns it off anyway, and every owner can unsubscribe (Account, or the link in each email).
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { mailEnabled, sendMail, type Mail } from './mail';
import { lastWeeks, statsConfig, trailerLine, weekStats, type WeekStats } from './stats';

const { user, profile, emailPref, digestSent } = schema;
// a stage's path (like pageLink, without pulling in import.meta.env so tests can load this)
const pageLink = (handle: string) => `${(import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')}${handle}/`;

export const digestEnabled = () => !!statsConfig() && mailEnabled && !/^(0|false|no)$/i.test(process.env.WEEKLY_DIGEST ?? '');

// ---- unsubscribe links: signed, so they work without signing in and can't be guessed ----

const sign = (userId: string) => createHmac('sha256', process.env.BETTER_AUTH_SECRET ?? 'dev').update(`digest-unsubscribe:${userId}`).digest('base64url').slice(0, 32);
export const unsubscribeUrl = (base: string, userId: string) => `${new URL('api/digest/unsubscribe', base).href}?u=${encodeURIComponent(userId)}&t=${sign(userId)}`;
export const validUnsubscribe = (userId: string, token: string) => {
  const want = Buffer.from(sign(userId));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
};

export async function setWeeklyDigest(userId: string, on: boolean) {
  await db.insert(emailPref).values({ userId, weeklyDigest: on }).onConflictDoUpdate({ target: emailPref.userId, set: { weeklyDigest: on, updatedAt: new Date() } });
}
export async function wantsWeeklyDigest(userId: string) {
  const [r] = await db.select({ on: emailPref.weeklyDigest }).from(emailPref).where(eq(emailPref.userId, userId));
  return r?.on ?? true;
}

// ---- the email ----

const trend = (now: number, before: number) => {
  if (!before) return now ? 'new this week' : '';
  const pct = Math.round(((now - before) / before) * 100);
  return pct === 0 ? 'same as the week before' : `${pct > 0 ? '+' : ''}${pct}% vs the week before`;
};
const human = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** The digest, or null when there's nothing to tell (no visitors two weeks running). */
export function digestMail(to: { email: string; name: string }, handle: string, s: WeekStats, urls: { account: string; stage: string; unsubscribe: string }): Mail | null {
  if (!s.visitors && !s.previous) return null;
  const people = `${s.visitors} ${s.visitors === 1 ? 'person' : 'people'}`;
  const t = trend(s.visitors, s.previous);
  const rows: [string, string][] = [
    ['Visitors', `${s.visitors}${t ? ` · ${t}` : ''}`],
    ['Page views', String(s.pageviews)],
    ...(s.sources.length ? [['Came from', s.sources.map((x) => `${x.name} ${x.visitors}`).join(' · ')] as [string, string]] : []),
    ...(s.countries.length ? [['Countries', s.countries.map((x) => x.name).join(' · ')] as [string, string]] : []),
    ...(s.trailer?.views ? [['Your trailer', trailerLine(s.trailer)] as [string, string]] : []),
  ];
  return {
    to: to.email,
    subject: s.visitors ? `${people} visited your stage last week` : 'A quiet week on your stage',
    heading: s.visitors ? `${people} saw your stage` : 'A quiet week',
    body: s.visitors
      ? `Here's who came to /${handle} from ${human(s.from)} to ${human(s.to)}.`
      : `Nobody visited /${handle} from ${human(s.from)} to ${human(s.to)}. Sharing it on LinkedIn or in your GitHub README usually changes that.`,
    rows,
    action: { label: 'See your stats', url: urls.account },
    footer: `Your stage: ${urls.stage} · You get this once a week. Unsubscribe: ${urls.unsubscribe}`,
    headers: { 'List-Unsubscribe': `<${urls.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  };
}

/** Build and send one owner's digest now (no weekly lock) — for the admin preview. */
export async function sendDigestTo(userId: string, base: string, now = new Date()) {
  const [r] = await db
    .select({ email: user.email, name: user.name, handle: profile.handle })
    .from(profile)
    .innerJoin(user, eq(user.id, profile.userId))
    .where(eq(profile.userId, userId));
  if (!r) throw new Error('Claim and publish a stage first');
  const s = await weekStats(pageLink(r.handle), now);
  if (!s) throw new Error('Owner stats are off (PLAUSIBLE_API_KEY)');
  const mail = digestMail(r, r.handle, s, urls(base, userId, r.handle));
  if (!mail) return { sent: false, reason: 'No visitors the last two weeks — nothing to send', stats: s };
  await sendMail(mail);
  return { sent: true, to: r.email, stats: s };
}

const urls = (base: string, userId: string, handle: string) => ({
  account: new URL('account', base).href,
  stage: new URL(pageLink(handle).replace(/^\//, ''), base).href,
  unsubscribe: unsubscribeUrl(base, userId),
});

// ---- the weekly run ----

/** From Monday 08:00 UTC on, send last week's digest to every opted-in owner of a live stage, once each. */
export async function sendDigests(base: string, now = new Date()) {
  const { week } = lastWeeks(now);
  const monday = new Date(`${week[1]}T00:00:00Z`).getTime() + 864e5; // the Monday after last week ended
  if (now.getTime() < monday + 8 * 3600e3) return { week: week[0], sent: 0, skipped: 'before Monday 08:00 UTC' };
  const owners = await db
    .select({ userId: user.id, email: user.email, name: user.name, handle: profile.handle })
    .from(profile)
    .innerJoin(user, eq(user.id, profile.userId))
    .leftJoin(emailPref, eq(emailPref.userId, user.id))
    .where(and(eq(profile.published, true), isNull(profile.hiddenAt), sql`coalesce(${emailPref.weeklyDigest}, true)`));
  let sent = 0;
  for (const o of owners) {
    // claim this owner's week first: another replica (or the next run) skips it
    const claimed = await db.insert(digestSent).values({ userId: o.userId, week: week[0] }).onConflictDoNothing().returning();
    if (!claimed.length) continue;
    try {
      const s = await weekStats(pageLink(o.handle), now);
      const mail = s && digestMail(o, o.handle, s, urls(base, o.userId, o.handle));
      if (mail) { await sendMail(mail); sent++; }
    } catch (e) {
      // Plausible or SMTP trouble: release the claim so the next hourly run retries
      await db.delete(digestSent).where(and(eq(digestSent.userId, o.userId), eq(digestSent.week, week[0])));
      console.error(`[digest] ${o.handle}: ${(e as Error).message}`);
    }
  }
  return { week: week[0], sent, owners: owners.length };
}

/** Hourly check in the server process; the per-owner claim makes it safe to run everywhere. */
export function startDigestScheduler(base: string) {
  const g = globalThis as unknown as { __starringDigest?: ReturnType<typeof setInterval> };
  if (g.__starringDigest || !digestEnabled()) return;
  const run = () => sendDigests(base).then((r) => r.sent && console.log(`[digest] week of ${r.week}: sent ${r.sent}`)).catch((e) => console.error('[digest]', e.message));
  g.__starringDigest = setInterval(run, 3600e3);
  g.__starringDigest.unref?.();
  setTimeout(run, 60e3).unref?.();
}
