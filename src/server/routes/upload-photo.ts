// POST /api/upload/photo — multipart { file: JPEG } → { url }. The editor crops and re-encodes
// the photo in the browser; here it's checked, stripped of metadata (EXIF, GPS…) and stored.
// Signed-in only, 20 a day per user. Off unless STORAGE is configured.
import type { APIRoute } from 'astro';
import { getSession } from '../auth';
import { fail, json, sameOrigin } from '../http';
import { ImageError, cleanJpeg } from '../images';
import { rateLimited } from '../moderation';
import { newPhotoKey, prunePhotos } from '../photos';
import { getByUser } from '../profiles';
import { storage } from '../storage';
import { publicBase } from '../../lib/site';

export const prerender = false;

const MAX_BYTES = 3 * 1024 * 1024;

export const POST: APIRoute = async ({ request }) => {
  const s = storage();
  if (!s) return fail(404, 'Uploads are not enabled on this instance');
  if (!sameOrigin(request)) return fail(403, 'Cross-origin request blocked');
  const session = await getSession(request);
  if (!session) return fail(401, 'Sign in to upload a photo');
  if (rateLimited(`photo|${session.user.id}`, 20, 24 * 3600e3)) return fail(429, 'That’s 20 photos today — try again tomorrow');
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return fail(400, 'Choose a photo');
  if (file.size > MAX_BYTES) return fail(413, 'That photo is over 3 MB');
  try {
    const { bytes, width, height } = cleanJpeg(new Uint8Array(await file.arrayBuffer()), { min: 200, max: 2400 });
    const key = newPhotoKey(session.user.id);
    await s.put(key, bytes, 'image/jpeg');
    const url = new URL(s.url(key), publicBase(undefined, new URL(request.url))).href;
    // the previous photo goes, unless the saved profile still shows it
    const own = await getByUser(session.user.id);
    prunePhotos(s, session.user.id, [own?.data?.profile?.photo, own?.live?.profile?.photo]).catch((e) => console.error('[photos] prune failed', e));
    return json({ url, width, height });
  } catch (e) {
    if (e instanceof ImageError) return fail(400, e.message);
    console.error('[photos] upload failed', e);
    return fail(502, 'Couldn’t store the photo — try again');
  }
};
