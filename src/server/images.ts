// Uploaded photos arrive as JPEGs the editor already cropped and re-encoded in the browser,
// but nothing a browser sends can be trusted. This checks the file really is a baseline or
// progressive JPEG of a sane size and rewrites it without metadata: EXIF (GPS, camera, date),
// XMP, ICC-less comments… Only the segments a decoder needs are kept, so there's no image
// library to install and nothing is decoded on the server.

export class ImageError extends Error {}

export interface CleanJpeg { bytes: Uint8Array; width: number; height: number }

const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** Segments a decoder needs (plus JFIF and Adobe, which tell it the colour transform). */
const KEEP = new Set([0xe0, 0xee, 0xdb, 0xc4, 0xdd, ...SOF]);

export function cleanJpeg(input: Uint8Array, limits = { min: 64, max: 2400 }): CleanJpeg {
  const b = input;
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) throw new ImageError('That isn’t a JPEG image');
  const out: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let i = 2;
  let width = 0;
  let height = 0;
  while (i < b.length) {
    if (b[i] !== 0xff) throw new ImageError('That JPEG is damaged');
    while (b[i] === 0xff) i++; // fill bytes
    const marker = b[i++];
    if (marker === 0xd9) break; // EOI without a scan
    if (marker >= 0xd0 && marker <= 0xd7) continue; // RST outside a scan: no length
    if (i + 2 > b.length) throw new ImageError('That JPEG is cut short');
    const len = (b[i] << 8) | b[i + 1];
    if (len < 2 || i + len > b.length) throw new ImageError('That JPEG is damaged');
    const segment = b.subarray(i - 2, i + len);
    if (SOF.has(marker)) {
      height = (b[i + 3] << 8) | b[i + 4];
      width = (b[i + 5] << 8) | b[i + 6];
    }
    if (marker === 0xda) {
      // start of scan: everything from here to the end is image data (and maybe more scans)
      if (!width || !height) throw new ImageError('That JPEG has no size');
      let end = b.length;
      // trim anything after the last EOI (some tools append data there)
      for (let j = b.length - 2; j > i; j--) if (b[j] === 0xff && b[j + 1] === 0xd9) { end = j + 2; break; }
      out.push(b.subarray(i - 2, end));
      i = b.length;
      break;
    }
    if (KEEP.has(marker)) out.push(segment);
    i += len;
  }
  if (!width || !height) throw new ImageError('That JPEG has no image data');
  if (width < limits.min || height < limits.min) throw new ImageError(`That photo is too small — at least ${limits.min}×${limits.min} px`);
  if (width > limits.max || height > limits.max) throw new ImageError(`That photo is too big — at most ${limits.max}×${limits.max} px`);
  const size = out.reduce((n, x) => n + x.length, 0);
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const x of out) { bytes.set(x, at); at += x.length; }
  return { bytes, width, height };
}
