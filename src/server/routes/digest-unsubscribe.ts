// /api/digest/unsubscribe?u=…&t=… — the link in every weekly email. GET shows a confirmation page,
// POST is RFC 8058 one-click (mail clients' "Unsubscribe" button). Signed, so no sign-in needed.
import type { APIRoute } from 'astro';
import { setWeeklyDigest, validUnsubscribe } from '../digest';

export const prerender = false;

const page = (title: string, text: string, status = 200) =>
  new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title} — Starring</title>` +
      `<body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#0a0a0a;color:#f2f0e9;font:18px/1.5 system-ui,sans-serif"><main style="max-width:520px;padding:24px"><p style="display:flex;align-items:center;gap:10px;font:700 20px/1 system-ui,sans-serif;letter-spacing:-.5px"><img src="/brand/mark.svg" alt="" width="28" height="28">starring</p><h1 style="font-size:36px;margin:12px 0">${title}</h1><p style="color:#c9c6bd">${text}</p><p><a href="/account" style="color:#d4ff00">Email settings →</a></p></main></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );

const unsubscribe = async (url: URL) => {
  const u = url.searchParams.get('u') ?? '';
  const t = url.searchParams.get('t') ?? '';
  if (!u || !validUnsubscribe(u, t)) return false;
  await setWeeklyDigest(u, false);
  return true;
};

export const GET: APIRoute = async ({ url }) =>
  (await unsubscribe(url))
    ? page('Unsubscribed', "You won't get the weekly email any more. You can turn it back on in your account.")
    : page('Link not valid', 'This unsubscribe link is incomplete. Sign in and change it in your account instead.', 400);

export const POST: APIRoute = async ({ url }) => new Response(null, { status: (await unsubscribe(url)) ? 200 : 400 });
