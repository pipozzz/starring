import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { SAFE_KEY, keyFromUrl, localStorage, prune, s3Storage, storage } from './storage';

test('storage is off unless configured, and s3 needs its credentials', () => {
  assert.equal(storage({}), null);
  assert.equal(storage({ STORAGE: 's3', S3_BUCKET: 'b' }), null);
  assert.equal(storage({ STORAGE: 'local', STORAGE_DIR: mkdtempSync(join(tmpdir(), 'st-')) })?.kind, 'local');
  assert.equal(storage({ STORAGE: 'S3', S3_ENDPOINT: 'https://x.r2.cloudflarestorage.com', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'k', S3_SECRET_ACCESS_KEY: 's' })?.kind, 's3');
});

test('local: put, get, list, prune; keys can’t escape the folder', async () => {
  const s = localStorage(mkdtempSync(join(tmpdir(), 'st-')));
  await s.put('photos/u1/a.jpg', new Uint8Array([1, 2, 3]), 'image/jpeg');
  await s.put('photos/u1/b.jpg', new Uint8Array([4]), 'image/jpeg');
  await s.put('photos/u2/c.jpg', new Uint8Array([5]), 'image/jpeg');
  assert.deepEqual((await s.get('photos/u1/a.jpg'))?.bytes, new Uint8Array([1, 2, 3]));
  assert.equal((await s.get('photos/u1/a.jpg'))?.type, 'image/jpeg');
  assert.deepEqual((await s.list('photos/u1/')).sort(), ['photos/u1/a.jpg', 'photos/u1/b.jpg']);
  await prune(s, 'photos/u1/', ['photos/u1/b.jpg']);
  assert.deepEqual(await s.list('photos/u1/'), ['photos/u1/b.jpg']);
  assert.deepEqual(await s.list('photos/u2/'), ['photos/u2/c.jpg'], 'other users untouched');
  assert.equal(await s.get('photos/nobody/x.jpg'), null);
  await assert.rejects(() => s.put('../../etc/x.jpg', new Uint8Array([1]), 'image/jpeg'));
  assert.equal(s.url('photos/u1/b.jpg'), '/media/photos/u1/b.jpg');
});

test('safe keys and our own URLs', () => {
  assert.ok(SAFE_KEY.test('photos/u_1-x/AbC123.jpg'));
  for (const bad of ['../x.jpg', 'photos/u1/../../x.jpg', 'photos/u1/a.html', 'photos/u1/a.jpg?x', 'photos//a.jpg']) assert.ok(!SAFE_KEY.test(bad), bad);
  const s = localStorage(mkdtempSync(join(tmpdir(), 'st-')));
  assert.equal(keyFromUrl(s, '/media/photos/u1/a.jpg'), 'photos/u1/a.jpg');
  assert.equal(keyFromUrl(s, 'https://evil.example/photos/u1/a.jpg'), null);
  assert.equal(keyFromUrl(s, undefined), null);
});

test('s3: signed, path-style requests to any S3-compatible endpoint', async () => {
  const calls: Request[] = [];
  const fake = (async (req: Request) => {
    calls.push(req);
    if (req.method === 'GET' && req.url.includes('list-type=2')) return new Response('<ListBucketResult><Contents><Key>photos/u1/a.jpg</Key></Contents><Contents><Key>photos/u1/b.jpg</Key></Contents></ListBucketResult>');
    if (req.method === 'GET') return new Response(new Uint8Array([9]), { headers: { 'content-type': 'image/jpeg' } });
    return new Response(null, { status: 200 });
  }) as unknown as typeof fetch;
  const env = { S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com/', S3_BUCKET: 'starring', S3_ACCESS_KEY_ID: 'AKIA', S3_SECRET_ACCESS_KEY: 'secret', S3_PUBLIC_URL: 'https://cdn.example.com/' };
  const s = s3Storage(env, fake);
  await s.put('photos/u1/a.jpg', new Uint8Array([1]), 'image/jpeg');
  const put = calls[0];
  assert.equal(put.method, 'PUT');
  assert.equal(put.url, 'https://acc.r2.cloudflarestorage.com/starring/photos/u1/a.jpg');
  assert.match(put.headers.get('authorization') ?? '', /^AWS4-HMAC-SHA256 Credential=AKIA\/\d{8}\/auto\/s3\/aws4_request/);
  assert.equal(put.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual((await s.get('photos/u1/a.jpg'))?.bytes, new Uint8Array([9]));
  await prune(s, 'photos/u1/', ['photos/u1/b.jpg']);
  assert.deepEqual(calls.filter((c) => c.method === 'DELETE').map((c) => c.url), ['https://acc.r2.cloudflarestorage.com/starring/photos/u1/a.jpg']);
  assert.equal(s.url('photos/u1/b.jpg'), 'https://cdn.example.com/photos/u1/b.jpg');
  assert.equal(keyFromUrl(s, 'https://cdn.example.com/photos/u1/b.jpg'), 'photos/u1/b.jpg');
});
