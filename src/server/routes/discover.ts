// POST /api/discover { draft } → { suggestions, login, source } — what GitHub knows that the
// stage doesn't say yet (src/lib/discover.ts). Uses the owner's GitHub sign-in token when they
// have one, else the instance's GITHUB_TOKEN, else GitHub's anonymous API, for the GitHub user
// their profile links to. 10 checks a day per user.
// POST /api/discover { dismiss: key } — never suggest that again.
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { discover } from '../../lib/discover';
import { GithubImportError, importGithub, usernameFrom } from '../../lib/importers/github';
import type { Profile } from '../../lib/model';
import { getSession } from '../auth';
import { db, schema } from '../db';
import { fail, json, sameOrigin } from '../http';
import { rateLimited } from '../moderation';
import { githubToken } from './import-github';

export const prerender = false;

/** The GitHub login: the signed-in token's own account, else the profile's GitHub link. */
const whoOnGithub = async (token: string | undefined, draft: Profile) => {
  if (token) {
    const me = await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (me.ok) return { login: ((await me.json()) as { login: string }).login, own: true };
  }
  const link = draft.profile?.links?.github;
  const login = link ? usernameFrom(link) : '';
  return login ? { login, own: false } : null;
};

export const POST: APIRoute = async ({ request }) => {
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in first');
  const userId = session.user.id;
  const body = (await request.json().catch(() => ({}))) as { draft?: Profile; dismiss?: string };

  if (typeof body.dismiss === 'string') {
    if (body.dismiss.length > 300) return fail(400, 'Bad key');
    await db.insert(schema.discoveryDismissal).values({ userId, key: body.dismiss }).onConflictDoNothing();
    return json({ ok: true });
  }

  const draft = body.draft;
  if (!draft || typeof draft !== 'object' || !('profile' in draft)) return fail(400, 'Send your draft');
  if (rateLimited(`discover|${userId}`, 10, 24 * 3600e3)) return fail(429, 'That’s 10 checks today — try again tomorrow');
  const linked = await githubToken(userId);
  const who = await whoOnGithub(linked, draft);
  if (!who) return fail(404, 'Add your GitHub link in Headliner, or sign in with GitHub, to look for updates');
  // the user's own token reads their account; the instance token only public data
  const token = (who.own ? linked : undefined) ?? process.env.GITHUB_TOKEN?.trim() ?? undefined;
  try {
    const found = await importGithub(who.login, { token });
    const dismissed = new Set(
      (await db.select({ key: schema.discoveryDismissal.key }).from(schema.discoveryDismissal).where(eq(schema.discoveryDismissal.userId, userId))).map((r) => r.key),
    );
    return json({ login: who.login, source: who.own ? 'account' : 'link', suggestions: discover(draft, found.profile, dismissed) });
  } catch (e) {
    if (e instanceof GithubImportError) return fail(502, e.message);
    console.error('[discover]', e);
    return fail(500, 'Couldn’t reach GitHub — try again later');
  }
};
