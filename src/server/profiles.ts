// Profiles stored in Postgres (server mode). The `data` column holds the same
// Profile document as a YAML file; `handle` and `published` live beside it.
// `data` is the owner's draft (autosaved); `live` is the copy the public sees, taken
// when they publish. Public reads only ever see `live`.
import { and, eq, isNull, sql } from 'drizzle-orm';
import { HANDLE, RESERVED, validate, type Profile } from '../lib/model';
import { fileHandles } from '../lib/profiles';
import { hasTheme } from '../themes';
import { db, schema } from './db';
import { blockedReason } from './blocklist';

const { profile } = schema;

export interface OwnProfile {
  handle: string;
  published: boolean;
  hidden: boolean;
  hiddenReason?: string | null;
  updatedAt: string;
  /** The draft the editor works on. */
  data: Profile;
  /** What the public sees, when published. */
  live: Profile | null;
  publishedAt: string | null;
  /** The draft differs from the live version: there's something to publish. */
  changes: boolean;
}

/** Same document? jsonb stores both with the same key order, so their JSON compares directly. */
export const sameDoc = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const toOwn = (r: typeof profile.$inferSelect): OwnProfile => ({
  handle: r.handle,
  published: r.published,
  hidden: !!r.hiddenAt,
  hiddenReason: r.hiddenReason,
  updatedAt: r.updatedAt.toISOString(),
  data: { ...r.data, handle: r.handle },
  live: r.live ? { ...r.live, handle: r.handle } : null,
  publishedAt: r.publishedAt?.toISOString() ?? null,
  changes: r.published && !!r.live && !sameDoc({ ...r.data, handle: r.handle }, { ...r.live, handle: r.handle }),
});

/** The public's copy: `live`, or the draft for a row published before drafts existed. */
const publicDoc = (r: typeof profile.$inferSelect): Profile => ({ ...(r.live ?? r.data), handle: r.handle });

export const listPublished = async (): Promise<Profile[]> =>
  (await db.select().from(profile).where(and(eq(profile.published, true), isNull(profile.hiddenAt)))).map(publicDoc);

export const getPublished = async (handle: string): Promise<Profile | undefined> => {
  const [r] = await db.select().from(profile).where(and(eq(profile.handle, handle), eq(profile.published, true), isNull(profile.hiddenAt)));
  return r && publicDoc(r);
};

export const getByUser = async (userId: string): Promise<OwnProfile | undefined> => {
  const [r] = await db.select().from(profile).where(eq(profile.userId, userId));
  return r && toOwn(r);
};

export type HandleCheck = { ok: boolean; reason?: string };

export const checkHandle = async (handle: string, userId?: string, opts: { admin?: boolean } = {}): Promise<HandleCheck> => {
  if (!HANDLE.test(handle)) return { ok: false, reason: 'Use 2–39 lowercase letters, digits or dashes' };
  if (RESERVED.includes(handle)) return { ok: false, reason: 'This handle is reserved' };
  const blocked = !opts.admin && blockedReason(handle);
  if (blocked) return { ok: false, reason: blocked };
  if (fileHandles().includes(handle)) return { ok: false, reason: 'Already taken' };
  const [r] = await db.select({ userId: profile.userId }).from(profile).where(eq(profile.handle, handle));
  if (r && r.userId !== userId) return { ok: false, reason: 'Already taken' };
  return { ok: true };
};

export class ProfileError extends Error {
  constructor(message: string, public status = 400, public issues?: Record<string, string>) {
    super(message);
  }
}

const MAX_BYTES = 200_000;

/** Validate a document coming from the editor before it touches the DB. */
const clean = (data: unknown, handle: string): Profile => {
  if (!data || typeof data !== 'object' || !('profile' in data)) throw new ProfileError('Not a Starring profile');
  if (JSON.stringify(data).length > MAX_BYTES) throw new ProfileError('Profile is too large', 413);
  const p = { ...(data as Profile), handle };
  if (!hasTheme(p.theme)) p.theme = undefined;
  const issues = validate(p);
  delete issues.handle; // checked separately
  if (Object.keys(issues).length) throw new ProfileError('Some fields need attention', 422, issues);
  return p;
};

/** Create or update the user's profile. A changed handle is a rename. */
export const saveProfile = async (userId: string, input: { handle: string; data: unknown; published?: boolean }, opts: { admin?: boolean } = {}) => {
  const handle = input.handle.trim().toLowerCase();
  const check = await checkHandle(handle, userId, opts);
  if (!check.ok) throw new ProfileError(check.reason!, 409, { handle: check.reason! });
  const data = clean(input.data, handle);
  const existing = await getByUser(userId);
  if (existing?.hidden && input.published) throw new ProfileError('This profile was hidden by a moderator and can’t be published. Contact the operator.', 403);
  const now = new Date();
  // published: true publishes this very version; otherwise only the draft changes
  const goLive = input.published === true ? { live: data, publishedAt: now } : {};
  if (!existing) {
    const [r] = await db
      .insert(profile)
      .values({ handle, userId, data, published: input.published ?? false, createdAt: now, updatedAt: now, ...goLive })
      .returning();
    return toOwn(r);
  }
  const [r] = await db
    .update(profile)
    .set({ handle, data, updatedAt: now, ...(input.published !== undefined && { published: input.published }), ...goLive })
    .where(eq(profile.userId, userId))
    .returning();
  return toOwn(r);
};

/** Publish: the current draft becomes what the public sees. Unpublish: the page goes away (live is kept). */
export const setPublished = async (userId: string, published: boolean) => {
  if (published && (await getByUser(userId))?.hidden) throw new ProfileError('This profile was hidden by a moderator and can’t be published. Contact the operator.', 403);
  const now = new Date();
  const [r] = await db
    .update(profile)
    .set(published ? { published, live: sql`${profile.data}`, publishedAt: now, updatedAt: now } : { published, updatedAt: now })
    .where(eq(profile.userId, userId))
    .returning();
  if (!r) throw new ProfileError('Claim a handle first', 404);
  return toOwn(r);
};

/** Throw the draft away: back to what's live. */
export const discardChanges = async (userId: string) => {
  const own = await getByUser(userId);
  if (!own) throw new ProfileError('Claim a handle first', 404);
  if (!own.live) throw new ProfileError('Nothing is published yet, so there’s nothing to go back to', 409);
  const [r] = await db.update(profile).set({ data: own.live, updatedAt: new Date() }).where(eq(profile.userId, userId)).returning();
  return toOwn(r);
};

export const deleteProfile = (userId: string) => db.delete(profile).where(eq(profile.userId, userId));
