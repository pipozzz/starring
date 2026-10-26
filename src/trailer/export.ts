// Trailer → MP4 in the browser: each frame is drawn on a canvas and encoded with WebCodecs
// (H.264) into an MP4 by Mediabunny. Faster than real time, frame-exact, nothing uploaded.
// Mediabunny is loaded only when someone actually exports.

import { drawFrame, type Palette, type Trailer } from './engine';

export const FPS = 30;

export const FORMATS = {
  landscape: { w: 1920, h: 1080, label: '16:9', hint: 'LinkedIn, YouTube, X' },
  square: { w: 1080, h: 1080, label: '1:1', hint: 'LinkedIn and Instagram feed' },
  portrait: { w: 1080, h: 1920, label: '9:16', hint: 'Stories, Reels, TikTok, Shorts' },
} as const;
export type Format = keyof typeof FORMATS;

/** Whether this browser can encode H.264 MP4 at that size. */
export async function canExport(format: Format): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false;
  try {
    // H.264 High profile, level 4.0: what Mediabunny will ask for at 1080p (checked without loading it)
    const { w, h } = FORMATS[format];
    return !!(await VideoEncoder.isConfigSupported({ codec: 'avc1.640028', width: w, height: h })).supported;
  } catch {
    return false;
  }
}

export async function exportMp4(
  tr: Trailer,
  pal: Palette,
  img: (url?: string) => HTMLImageElement | undefined,
  format: Format,
  onProgress: (done: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  const { Output, Mp4OutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } = await import('mediabunny');
  const { w, h } = FORMATS[format];
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d', { alpha: false })!;
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  const frames = Math.ceil(tr.total * FPS);
  for (let i = 0; i < frames; i++) {
    if (signal.aborted) {
      await output.cancel();
      throw new DOMException('Export cancelled', 'AbortError');
    }
    drawFrame(ctx, w, h, i / FPS, tr, pal, img);
    await source.add(i / FPS, 1 / FPS);
    if (i % 5 === 0 || i === frames - 1) onProgress((i + 1) / frames);
  }
  await output.finalize();
  return new Blob([(output.target as InstanceType<typeof BufferTarget>).buffer!], { type: 'video/mp4' });
}
