// GET /media/<key> — files from storage (local disk, or a private S3 bucket). Immutable: a new
// upload gets a new key. Served as inert files: right type, no sniffing, sandboxed, cacheable,
// and loadable cross-origin (custom domains, the trailer's canvas, link previews).
import type { APIRoute } from 'astro';
import { SAFE_KEY, storage } from '../storage';

export const prerender = false;

export const GET: APIRoute = async ({ params }) => {
  const s = storage();
  const key = params.key ?? '';
  if (!s || !SAFE_KEY.test(key)) return new Response(null, { status: 404 });
  const file = await s.get(key);
  if (!file) return new Response(null, { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  return new Response(file.bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': file.type,
      'Content-Length': String(file.bytes.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Access-Control-Allow-Origin': '*',
    },
  });
};
