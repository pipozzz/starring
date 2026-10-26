import type { APIRoute } from 'astro';
import { createElement } from 'react';
import { SERVER_MODE, store, type Profile } from '../../lib/profiles';
import { ProfilePoster } from '../../lib/og/poster';
import { pngResponse, renderPng } from '../../lib/og/render';
import { link } from '../../lib/url';
import { publicBase } from '../../lib/site';

/** The profile's photo from this instance's storage, as a data: URL (never fetched from the web). */
async function storedPhoto(p: Profile): Promise<string | undefined> {
  if (!SERVER_MODE || !p.profile.photo) return undefined;
  const { storage, keyFromUrl } = await import('../../server/storage');
  const s = storage();
  const key = s && keyFromUrl(s, p.profile.photo);
  const file = key ? await s!.get(key).catch(() => null) : null;
  return file && file.type === 'image/jpeg' ? `data:image/jpeg;base64,${Buffer.from(file.bytes).toString('base64')}` : undefined;
}

export async function getStaticPaths() {
  return (await store.list()).map((p) => ({ params: { handle: p.handle }, props: { p } }));
}

export const GET: APIRoute = async ({ params, props, site, url }) => {
  const p = SERVER_MODE ? await store.get(params.handle!) : (props as { p: Profile }).p;
  if (!p) return new Response(null, { status: 404 });
  const host = publicBase(site, url).host + link().replace(/\/$/, '');
  return pngResponse(await renderPng(createElement(ProfilePoster, { p, host, photo: await storedPhoto(p) })), SERVER_MODE ? 600 : 3600);
};
