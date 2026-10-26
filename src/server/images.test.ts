import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Resvg } from '@resvg/resvg-js';
import { ImageError, cleanJpeg } from './images';

const photo = new Uint8Array(readFileSync(new URL('./fixtures/photo.jpg', import.meta.url)));

/** Puts an APP1 segment (EXIF-like, with a fake GPS tag) and a comment right after SOI. */
const withMetadata = (jpeg: Uint8Array) => {
  const exif = new TextEncoder().encode('Exif\0\0GPSLatitude=48.1486;GPSLongitude=17.1077;Make=Phone');
  const app1 = new Uint8Array([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff, ...exif]);
  const note = new TextEncoder().encode('secret comment');
  const com = new Uint8Array([0xff, 0xfe, (note.length + 2) >> 8, (note.length + 2) & 0xff, ...note]);
  return new Uint8Array([...jpeg.subarray(0, 2), ...app1, ...com, ...jpeg.subarray(2)]);
};

const hasMarker = (b: Uint8Array, marker: number) => {
  for (let i = 2; i < b.length - 1; ) {
    if (b[i] !== 0xff) return false;
    const m = b[i + 1];
    if (m === marker) return true;
    if (m === 0xda) return false;
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return false;
};

test('metadata is stripped and the photo still decodes', () => {
  const dirty = withMetadata(photo);
  assert.ok(hasMarker(dirty, 0xe1) && hasMarker(dirty, 0xfe));
  const { bytes, width, height } = cleanJpeg(dirty);
  assert.equal(width, 256);
  assert.equal(height, 256);
  assert.ok(!hasMarker(bytes, 0xe1), 'no EXIF/XMP');
  assert.ok(!hasMarker(bytes, 0xfe), 'no comments');
  assert.ok(!new TextDecoder('latin1').decode(bytes).includes('GPS'), 'no GPS anywhere');
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...bytes.subarray(-2)], [0xff, 0xd9]);
  // a real decoder still reads it
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><image href="data:image/jpeg;base64,${Buffer.from(bytes).toString('base64')}" width="256" height="256"/></svg>`;
  const px = new Resvg(svg).render().pixels;
  assert.ok(px.some((v, i) => i % 4 !== 3 && v > 0), 'renders pixels');
});

test('not a JPEG, damaged, too small or too big is refused', () => {
  assert.throws(() => cleanJpeg(new TextEncoder().encode('<svg onload=alert(1)>')), ImageError);
  assert.throws(() => cleanJpeg(photo.subarray(0, 40)), ImageError);
  assert.throws(() => cleanJpeg(photo, { min: 300, max: 2400 }), /too small/);
  assert.throws(() => cleanJpeg(photo, { min: 64, max: 200 }), /too big/);
});

test('bytes appended after the image are dropped', () => {
  const tail = new TextEncoder().encode('<html><script>alert(1)</script>');
  const { bytes } = cleanJpeg(new Uint8Array([...photo, ...tail]));
  assert.deepEqual([...bytes.subarray(-2)], [0xff, 0xd9]);
  assert.ok(!new TextDecoder('latin1').decode(bytes).includes('<script>'));
});
