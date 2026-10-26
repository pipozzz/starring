// Profile photos in storage: one current photo per user under photos/<user id>/, named
// <upload time>-<random>.jpg. Saving a profile clears out photos it no longer uses — except
// ones uploaded in the last few minutes, which an autosave still in flight may not mention yet.
import { randomBytes } from 'node:crypto';
import { keyFromUrl, type Storage } from './storage';

const FRESH_MS = 10 * 60 * 1000;
const USER_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const photoPrefix = (userId: string) => {
  if (!USER_ID.test(userId)) throw new Error('unexpected user id');
  return `photos/${userId}/`;
};

export const newPhotoKey = (userId: string, now = Date.now()) => `${photoPrefix(userId)}${now.toString(36)}-${randomBytes(12).toString('base64url')}.jpg`;

const uploadedAt = (key: string) => parseInt(key.split('/').pop()!.split('-')[0], 36);

/** Deletes the user's photos except `inUse` and fresh uploads; `all` deletes everything (account deletion). */
export async function prunePhotos(s: Storage, userId: string, inUse: string | undefined, opts: { all?: boolean; now?: number } = {}) {
  const now = opts.now ?? Date.now();
  const keep = opts.all ? null : keyFromUrl(s, inUse);
  const keys = await s.list(photoPrefix(userId));
  const stale = keys.filter((k) => opts.all || (k !== keep && !(now - uploadedAt(k) < FRESH_MS)));
  await Promise.all(stale.map((k) => s.remove(k)));
  return stale;
}
