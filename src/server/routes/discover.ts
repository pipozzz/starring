// Autodiscovery (src/lib/discover.ts, src/server/discovery.ts) for the signed-in owner:
// GET  /api/discover                → { check, weekly } — the latest GitHub check (weekly or their own)
// POST /api/discover { draft }      → { check } — look on GitHub now; 10 checks a day per user
// POST /api/discover { dismiss: key } — never suggest that again
// POST /api/discover { weekly: bool } — the weekly check on or off
// `check.found` is the fresh GitHub import; the editor turns it into suggestions against its draft.
import type { APIRoute } from 'astro';
import { GithubImportError } from '../../lib/importers/github';
import type { Profile } from '../../lib/model';
import { getSession } from '../auth';
import { db, schema } from '../db';
import { checkGithub, discoveryEnabled, latestCheck, NoGithub, setWeeklyDiscovery, wantsWeeklyDiscovery } from '../discovery';
import { fail, json, sameOrigin } from '../http';
import { rateLimited } from '../moderation';

export const prerender = false;

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in first');
  const userId = session.user.id;
  return json({ check: await latestCheck(userId), weekly: discoveryEnabled() ? await wantsWeeklyDiscovery(userId) : null });
};

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in first');
  const userId = session.user.id;
  const body = (await request.json().catch(() => ({}))) as { draft?: Profile; dismiss?: string; weekly?: unknown };

  if (typeof body.dismiss === 'string') {
    if (body.dismiss.length > 300) return fail(400, 'Bad key');
    await db.insert(schema.discoveryDismissal).values({ userId, key: body.dismiss }).onConflictDoNothing();
    return json({ ok: true });
  }
  if ('weekly' in body) {
    if (typeof body.weekly !== 'boolean') return fail(400, 'weekly must be true or false');
    await setWeeklyDiscovery(userId, body.weekly);
    return json({ weekly: body.weekly });
  }

  const draft = body.draft;
  if (!draft || typeof draft !== 'object' || !('profile' in draft)) return fail(400, 'Send your draft');
  if (rateLimited(`discover|${userId}`, 10, 24 * 3600e3)) return fail(429, 'That’s 10 checks today — try again tomorrow');
  try {
    await checkGithub(userId, draft);
    return json({ check: await latestCheck(userId) });
  } catch (e) {
    if (e instanceof NoGithub) return fail(404, e.message);
    if (e instanceof GithubImportError) return fail(502, e.message);
    console.error('[discover]', e);
    return fail(500, 'Couldn’t reach GitHub — try again later');
  }
};
