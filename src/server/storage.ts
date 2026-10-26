// Where uploaded files live. Off unless STORAGE is set:
//   STORAGE=local  → files under STORAGE_DIR (default ./data/uploads), served by /media/…
//   STORAGE=s3     → any S3-compatible bucket (AWS, Cloudflare R2, MinIO, Hetzner, Backblaze B2):
//                    S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_REGION (default "auto").
//                    S3_PUBLIC_URL (a public bucket or CDN) is used for links when set; otherwise
//                    /media/… streams objects through the app, so the bucket can stay private.
// Keys look like photos/<user id>/<random>.jpg, so everything a user uploaded shares a prefix.

import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { AwsClient } from 'aws4fetch';

export interface Storage {
  kind: 'local' | 's3';
  put(key: string, bytes: Uint8Array, type: string): Promise<void>;
  get(key: string): Promise<{ bytes: Uint8Array; type: string } | null>;
  /** Keys that start with `prefix`. */
  list(prefix: string): Promise<string[]>;
  remove(key: string): Promise<void>;
  /** The address a browser loads the file from. */
  url(key: string): string;
}

/** Keys are ours, never user input — but /media/… paths are, so refuse anything odd. */
export const SAFE_KEY = /^[a-z]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.(jpg|webp|png|mp4)$/;

const TYPES: Record<string, string> = { jpg: 'image/jpeg', webp: 'image/webp', png: 'image/png', mp4: 'video/mp4' };
export const typeOf = (key: string) => TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream';

export function localStorage(dir: string): Storage {
  const root = resolve(dir);
  const path = (key: string) => {
    const p = resolve(join(root, key));
    if (!p.startsWith(root + '/')) throw new Error('bad key');
    return p;
  };
  return {
    kind: 'local',
    async put(key, bytes) {
      await mkdir(dirname(path(key)), { recursive: true });
      await writeFile(path(key), bytes);
    },
    async get(key) {
      try {
        return { bytes: new Uint8Array(await readFile(path(key))), type: typeOf(key) };
      } catch {
        return null;
      }
    },
    async list(prefix) {
      const dir = prefix.replace(/\/$/, '');
      try {
        return (await readdir(path(dir))).map((f) => `${dir}/${f}`);
      } catch {
        return [];
      }
    },
    async remove(key) {
      await rm(path(key), { force: true });
    },
    url: (key) => `/media/${key}`,
  };
}

export function s3Storage(env: NodeJS.ProcessEnv, fetchImpl: typeof fetch = fetch): Storage {
  const endpoint = env.S3_ENDPOINT!.replace(/\/$/, '');
  const bucket = env.S3_BUCKET!;
  const aws = new AwsClient({ accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY!, service: 's3', region: env.S3_REGION || 'auto' });
  // path-style addressing works with every S3-compatible service
  const objectUrl = (key: string) => `${endpoint}/${bucket}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const send = async (url: string, init: RequestInit) => {
    const signed = await aws.sign(url, init);
    return fetchImpl(signed);
  };
  const publicBase = env.S3_PUBLIC_URL?.replace(/\/$/, '');
  return {
    kind: 's3',
    async put(key, bytes, type) {
      const res = await send(objectUrl(key), { method: 'PUT', body: bytes as unknown as BodyInit, headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable' } });
      if (!res.ok) throw new Error(`S3 PUT ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
    async get(key) {
      const res = await send(objectUrl(key), { method: 'GET' });
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new Error(`S3 GET ${res.status}`);
      return { bytes: new Uint8Array(await res.arrayBuffer()), type: res.headers.get('content-type') || typeOf(key) };
    },
    async remove(key) {
      const res = await send(objectUrl(key), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`S3 DELETE ${res.status}`);
    },
    async list(prefix) {
      const res = await send(`${endpoint}/${bucket}?list-type=2&prefix=${encodeURIComponent(prefix)}`, { method: 'GET' });
      if (!res.ok) throw new Error(`S3 LIST ${res.status}`);
      return [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    },
    url: (key) => (publicBase ? `${publicBase}/${key}` : `/media/${key}`),
  };
}

/** Deletes every object under `prefix` except the keys in `keep`. */
export async function prune(s: Storage, prefix: string, keep: string[] = []) {
  const keys = await s.list(prefix);
  await Promise.all(keys.filter((k) => !keep.includes(k)).map((k) => s.remove(k)));
}

/** The storage key behind one of our own photo URLs, or null for anything else. */
export const keyFromUrl = (s: Storage, url: string | undefined): string | null => {
  if (!url) return null;
  const base = s.url('');
  let key: string | null = null;
  if (/^https?:\/\//.test(base) && url.startsWith(base)) key = url.slice(base.length);
  else {
    // our own /media/… address, relative or absolute (we store absolute URLs so they work everywhere)
    const path = /^https?:\/\//.test(url) ? new URL(url).pathname : url;
    if (path.startsWith('/media/')) key = path.slice('/media/'.length);
  }
  return key && SAFE_KEY.test(key) ? key : null;
};

let cached: Storage | null | undefined;

/** The configured storage, or null when uploads are off. */
export function storage(env: NodeJS.ProcessEnv = process.env): Storage | null {
  if (env === process.env && cached !== undefined) return cached;
  const kind = env.STORAGE?.trim().toLowerCase();
  let s: Storage | null = null;
  if (kind === 'local') s = localStorage(env.STORAGE_DIR?.trim() || './data/uploads');
  else if (kind === 's3') {
    const missing = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'].filter((k) => !env[k]?.trim());
    if (missing.length) console.error(`[storage] STORAGE=s3 but ${missing.join(', ')} not set — uploads are off`);
    else s = s3Storage(env);
  }
  if (env === process.env) cached = s;
  return s;
}
