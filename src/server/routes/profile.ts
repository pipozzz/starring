import type { APIRoute } from 'astro';
import { getSession } from '../auth';
import { fail, json, sameOrigin } from '../http';
import { ProfileError, deleteProfile, discardChanges, getByUser, saveProfile, setPublished } from '../profiles';
import { isAdmin } from '../blocklist';
import { prunePhotos } from '../photos';
import { storage } from '../storage';

export const prerender = false;

type Guard = { error: Response; userId?: never; admin?: never } | { error?: never; userId: string; admin: boolean };

const guard = async (request: Request): Promise<Guard> => {
  if (request.method !== 'GET' && !sameOrigin(request)) return { error: fail(403, 'Cross-origin request blocked') };
  const session = await getSession(request);
  if (!session) return { error: fail(401, 'Sign in first') };
  return { userId: session.user.id, admin: isAdmin(session.user.email) };
};

const handleErrors = (e: unknown) => {
  if (e instanceof ProfileError) return fail(e.status, e.message, e.issues ? { issues: e.issues } : {});
  console.error(e);
  return fail(500, 'Something went wrong');
};

export const GET: APIRoute = async ({ request }) => {
  const g = await guard(request);
  if (g.error) return g.error;
  const p = await getByUser(g.userId);
  return p ? json(p) : fail(404, 'No profile yet');
};

/** PUT { handle, data, published? } — create or update (autosave target). */
export const PUT: APIRoute = async ({ request }) => {
  const g = await guard(request);
  if (g.error) return g.error;
  try {
    const body = (await request.json()) as { handle?: string; data?: unknown; published?: boolean };
    if (!body.handle) return fail(400, 'handle is required');
    const saved = await saveProfile(g.userId, { handle: body.handle, data: body.data, published: body.published }, { admin: g.admin });
    // photos this profile no longer shows can go
    const s = storage();
    if (s) prunePhotos(s, g.userId, [saved.data?.profile?.photo, saved.live?.profile?.photo]).catch((e) => console.error('[photos] prune failed', e));
    return json(saved);
  } catch (e) {
    return handleErrors(e);
  }
};

/**
 * PATCH { published } — publish the current draft (true) or take the page down (false).
 * PATCH { discard: true } — throw the draft away and go back to the live version.
 */
export const PATCH: APIRoute = async ({ request }) => {
  const g = await guard(request);
  if (g.error) return g.error;
  try {
    const body = (await request.json()) as { published?: boolean; discard?: boolean };
    if (body.discard) return json(await discardChanges(g.userId));
    return json(await setPublished(g.userId, !!body.published));
  } catch (e) {
    return handleErrors(e);
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  const g = await guard(request);
  if (g.error) return g.error;
  await deleteProfile(g.userId);
  return json({ ok: true });
};
