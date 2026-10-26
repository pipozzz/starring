// The trailer renderer: every frame is a pure function of time, so the live player and the
// MP4 export draw exactly the same pictures. A genre (genres/*.ts) decides how each scene
// looks; this file holds the clock, the shared drawing helpers and the frame loop.

import { at, timeline, type Scene, type Timed } from './script';

export interface Palette { bg: string; fg: string; muted: string; accent: string; line: string }

export interface Stage {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  /** 1% of the shorter side: every size is in these units, so 16:9, 1:1 and 9:16 all work. */
  u: number;
  portrait: boolean;
  pal: Palette;
  /** Seconds since the trailer started. */
  t: number;
  /** A loaded image, or undefined while it loads or when it failed. */
  img: (url?: string) => HTMLImageElement | undefined;
}

export interface SceneCtx { st: Stage; p: number; s: number; dur: number; index: number; total: number }

export interface Genre {
  id: string;
  label: string;
  blurb: string;
  /** > 1 is slower. */
  speed: number;
  /** CSS font specs the genre draws with; the player waits for them before playing. */
  fonts: string[];
  palette: (theme: { accent: string; scheme: 'dark' | 'light' }) => Palette;
  scene: (c: SceneCtx, scene: Scene) => void;
  /** Drawn over every frame: letterbox, grain, vignette… */
  overlay?: (st: Stage, total: number) => void;
}

// ---------- easing ----------

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
/** Progress of `v` through [a, b], clamped to 0–1. */
export const seg = (v: number, a: number, b: number) => clamp((v - a) / (b - a));
export const outCubic = (x: number) => 1 - (1 - x) ** 3;
export const inOutCubic = (x: number) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
export const outExpo = (x: number) => (x >= 1 ? 1 : 1 - 2 ** (-10 * x));
export const outBack = (x: number) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2;
export const lerp = (a: number, b: number, x: number) => a + (b - a) * x;
/** Fade in over `fin` seconds and out over `fout` seconds of a scene. */
export const envelope = (s: number, dur: number, fin = 0.25, fout = 0.25) => clamp(Math.min(fin ? s / fin : 1, fout ? (dur - s) / fout : 1));

/** Deterministic noise in [0, 1) for an integer seed. */
export const hash = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 2 ** 32;
};

// ---------- text ----------

export interface TextOpts {
  size: number;
  font: string;
  weight?: number | string;
  italic?: boolean;
  color?: string | CanvasGradient;
  align?: CanvasTextAlign;
  base?: CanvasTextBaseline;
  alpha?: number;
  /** Letter spacing in em. */
  track?: number;
  /** Shrinks the text to fit this width. */
  maxW?: number;
  upper?: boolean;
}

const fontSpec = (o: TextOpts, size: number) => `${o.italic ? 'italic ' : ''}${o.weight ?? 400} ${size}px ${o.font}`;

/** Draws one line; returns its width and the size actually used. */
export function text(st: Stage, str: string, x: number, y: number, o: TextOpts) {
  const { ctx } = st;
  const s = o.upper ? str.toUpperCase() : str;
  let size = o.size;
  ctx.save();
  const apply = () => {
    ctx.font = fontSpec(o, size);
    (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(o.track ?? 0) * size}px`;
  };
  apply();
  let w = ctx.measureText(s).width;
  if (o.maxW && w > o.maxW) {
    size *= o.maxW / w;
    apply();
    w = ctx.measureText(s).width;
  }
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.fillStyle = o.color ?? st.pal.fg;
  ctx.textAlign = o.align ?? 'center';
  ctx.textBaseline = o.base ?? 'middle';
  ctx.fillText(s, x, y);
  ctx.restore();
  return { w, size };
}

/** Width of a line without drawing it. */
export function measure(st: Stage, str: string, o: TextOpts) {
  const { ctx } = st;
  ctx.save();
  ctx.font = fontSpec(o, o.size);
  (ctx as unknown as { letterSpacing: string }).letterSpacing = `${(o.track ?? 0) * o.size}px`;
  const w = ctx.measureText(o.upper ? str.toUpperCase() : str).width;
  ctx.restore();
  return w;
}

/** Breaks `str` into lines no wider than `maxW`. */
export function wrap(st: Stage, str: string, maxW: number, o: TextOpts): string[] {
  const words = str.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(st, next, o) > maxW) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** The first `n` characters a typist would have typed after `s` seconds. */
export const typed = (str: string, s: number, cps = 26) => str.slice(0, Math.max(0, Math.floor(s * cps)));

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** A scaled draw around (cx, cy): call `fn` with the transform applied. */
export function scaled(st: Stage, cx: number, cy: number, k: number, fn: () => void) {
  st.ctx.save();
  st.ctx.translate(cx, cy);
  st.ctx.scale(k, k);
  st.ctx.translate(-cx, -cy);
  fn();
  st.ctx.restore();
}

/**
 * Where the 53 × 7 heatmap cells go: one strip on wide formats, two half-years stacked on
 * tall ones so the cells stay big. `pos(c, r)` is a cell's top-left corner.
 */
export function heatGeometry(st: Stage, cy: number, maxW: number, maxH: number) {
  const split = st.portrait ? 2 : 1;
  const per = Math.ceil(53 / split);
  const rows = 7 * split + (split - 1) * 1.5;
  const cell = Math.min(maxW / per, maxH / rows);
  const x0 = (st.w - cell * per) / 2;
  const top = cy - (cell * rows) / 2;
  return {
    cell,
    top,
    bottom: top + cell * rows,
    pos: (c: number, r: number) => ({ x: x0 + (c % per) * cell, y: top + Math.floor(c / per) * cell * 8.5 + r * cell }),
  };
}

// ---------- the Starring mark (same geometry as scripts/brand.mjs) ----------

const STAR = 'M32 9Q34.6 29.4 55 32Q34.6 34.6 32 55Q29.4 34.6 9 32Q29.4 29.4 32 9Z';
let starPath: Path2D | null = null;

/**
 * The tile mark centred on (cx, cy), `size` px wide. `pop` scales the tile (0 → 1, may
 * overshoot); `spin` 0 → 1 turns and grows the star into place.
 */
export function drawMark(st: Stage, cx: number, cy: number, size: number, o: { tile: string; star: string; pop?: number; spin?: number; alpha?: number }) {
  const { ctx } = st;
  const pop = o.pop ?? 1;
  const spin = o.spin ?? 1;
  if (pop <= 0) return;
  starPath ??= new Path2D(STAR);
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  ctx.translate(cx, cy);
  ctx.scale((size / 64) * pop, (size / 64) * pop);
  ctx.translate(-32, -32);
  roundRect(ctx, 2, 2, 60, 60, 15);
  ctx.fillStyle = o.tile;
  ctx.fill();
  ctx.translate(32, 32);
  ctx.rotate((1 - spin) * -Math.PI * 0.75);
  const k = lerp(0.3, 1, spin);
  ctx.scale(k, k);
  ctx.translate(-32, -32);
  ctx.fillStyle = o.star;
  ctx.fill(starPath);
  ctx.restore();
}

/** The mark and the lowercase wordmark side by side, centred; returns the lockup's box. */
export function lockup(st: Stage, cy: number, h: number, o: { tile: string; star: string; word: string; pop: number; spin: number; reveal: number; alpha?: number; font: string }) {
  const wordSize = h * 0.86;
  const wordW = measure(st, 'starring', { size: wordSize, font: o.font, weight: 700, track: -0.03 });
  const gap = h * 0.32;
  const total = h + gap + wordW;
  const x0 = st.w / 2 - total / 2;
  drawMark(st, x0 + h / 2, cy, h, { tile: o.tile, star: o.star, pop: o.pop, spin: o.spin, alpha: o.alpha });
  if (o.reveal > 0) {
    const { ctx } = st;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + h + gap * 0.5, cy - h, (wordW + gap) * o.reveal, h * 2);
    ctx.clip();
    text(st, 'starring', x0 + h + gap - (1 - o.reveal) * wordSize * 0.4, cy - h * 0.04, { size: wordSize, font: o.font, weight: 700, track: -0.03, align: 'left', color: o.word, alpha: o.alpha });
    ctx.restore();
  }
  return { left: x0, right: x0 + total, top: cy - h / 2, bottom: cy + h / 2 };
}

/** Draws `im` filling the box (cropped, centred) — like CSS object-fit: cover. */
export function cover(ctx: CanvasRenderingContext2D, im: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const r = w / h;
  const ir = im.naturalWidth / im.naturalHeight;
  const sw = ir > r ? im.naturalHeight * r : im.naturalWidth;
  const sh = ir > r ? im.naturalHeight : im.naturalWidth / r;
  ctx.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * Where the title card puts the portrait and how far the text moves: beside the text on wide
 * formats, above it on square and tall ones. `null` when there's no photo.
 */
export function titleLayout(st: Stage, mid: number, hasPhoto: boolean) {
  if (!hasPhoto) return { photo: null, cx: st.w / 2, dy: 0, maxW: 1 };
  if (!st.portrait && st.w / st.h > 1.3) {
    const h = 52 * st.u;
    return { photo: { x: st.w * 0.24 - (h * 0.8) / 2, y: mid - h / 2, w: h * 0.8, h }, cx: st.w * 0.62, dy: 0, maxW: 0.55 };
  }
  const h = (st.portrait ? 34 : 24) * st.u;
  const dy = h * 0.55;
  const cy = mid - 22 * st.u + dy - 5 * st.u - h / 2;
  return { photo: { x: st.w / 2 - (h * 0.8) / 2, y: cy - h / 2, w: h * 0.8, h }, cx: st.w / 2, dy, maxW: 1 };
}

export const compactNumber = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n));

// ---------- the frame loop ----------

export interface Trailer {
  scenes: Scene[];
  genre: Genre;
  items: Timed[];
  total: number;
}

export const makeTrailer = (scenes: Scene[], genre: Genre): Trailer => ({ scenes, genre, ...timeline(scenes, genre.speed) });

/** Draws the frame at `t` seconds. */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, tr: Trailer, pal: Palette, img: Stage['img']) {
  const st: Stage = { ctx, w, h, u: Math.min(w, h) / 100, portrait: h > w * 1.1, pal, t, img };
  ctx.save();
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, w, h);
  const now = at(tr, t);
  tr.genre.scene({ st, p: now.p, s: now.s, dur: now.dur, index: now.index, total: tr.items.length }, now.scene);
  tr.genre.overlay?.(st, tr.total);
  ctx.restore();
}

/** Loads the scenes' images (CORS-enabled, so the canvas stays exportable). */
export function preloadImages(scenes: Scene[]): Promise<Map<string, HTMLImageElement>> {
  const urls = scenes.flatMap((x) => (x.kind === 'cameos' ? x.items.map((i) => i.logo) : x.kind === 'title' ? [x.photo] : [])).filter(Boolean) as string[];
  const map = new Map<string, HTMLImageElement>();
  return Promise.all(
    [...new Set(urls)].map(
      (url) =>
        new Promise<void>((done) => {
          const im = new Image();
          im.crossOrigin = 'anonymous';
          im.referrerPolicy = 'no-referrer';
          im.onload = () => { map.set(url, im); done(); };
          im.onerror = () => done();
          im.src = url;
          setTimeout(done, 6000);
        }),
    ),
  ).then(() => map);
}
