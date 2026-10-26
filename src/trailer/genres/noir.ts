// NOIR — a detective's case file: black and white, film grain and flicker, a typewriter that
// tells the story, a dossier with redactions and a searchlight over the commit history.
// Slower and quieter than the blockbuster; ignores the theme's colours on purpose.

import type { Scene } from '../script';
import {
  clamp, compactNumber, envelope, hash, heatGeometry, lerp, lockup, measure, outCubic, scaled, seg, text, typed, wrap,
  type Genre, type SceneCtx, type Stage,
} from '../engine';

const SERIF = "'DM Serif Display', Georgia, serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const FADE = 0.55;

/** Typewriter text, laid out as if fully typed so it doesn't shift; a block cursor while typing. */
function typewriter(st: Stage, str: string, x: number, y: number, s: number, o: { size: number; color?: string; align?: 'left' | 'center'; alpha?: number; maxW?: number; cps?: number }) {
  const opts = { size: o.size, font: MONO, align: 'left' as const, color: o.color, alpha: o.alpha, maxW: undefined };
  let size = o.size;
  const full = measure(st, str, opts);
  if (o.maxW && full > o.maxW) size *= o.maxW / full;
  const fw = measure(st, str, { ...opts, size });
  const left = o.align === 'left' ? x : x - fw / 2;
  const shown = typed(str, s, o.cps ?? 26);
  const w = text(st, shown, left, y, { ...opts, size }).w;
  const typing = shown.length < str.length;
  const blink = Math.floor(st.t * 2.2) % 2 === 0;
  if (s >= 0 && (typing || blink)) {
    st.ctx.save();
    st.ctx.globalAlpha = (o.alpha ?? 1) * 0.85;
    st.ctx.fillStyle = o.color ?? st.pal.fg;
    st.ctx.fillRect(left + w + size * 0.12, y - size * 0.55, size * 0.55, size * 1.05);
    st.ctx.restore();
  }
  return str.length / (o.cps ?? 26);
}

const serif = (st: Stage, str: string, y: number, size: number, alpha: number, o: { italic?: boolean; color?: string; maxW?: number } = {}) =>
  text(st, str, st.w / 2, y, { size, font: SERIF, italic: o.italic, alpha, color: o.color, maxW: o.maxW ?? st.w * 0.84 });

function open({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'open' }>) {
  const env = envelope(s, dur, FADE, FADE);
  const [a, b] = sc.privateShare >= 50 ? ['They said the work didn’t exist.', `${sc.privateShare}% of it never saw daylight.`] : ['Every career has a story.', 'This one was never on GitHub.'];
  const size = (st.portrait ? 4.4 : 4.2) * st.u;
  const t1 = typewriter(st, a, st.w / 2, st.h / 2 - 4 * st.u, s - 0.3, { size, alpha: env, maxW: st.w * 0.86 });
  typewriter(st, b, st.w / 2, st.h / 2 + 4 * st.u, s - 0.6 - t1, { size, alpha: env, maxW: st.w * 0.86, color: st.pal.fg });
}

function stat({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'stat' }>) {
  const env = envelope(s, dur, FADE, FADE);
  const drift = lerp(2 * st.u, -1 * st.u, outCubic(seg(s, 0, dur)));
  serif(st, `${sc.value.toLocaleString('en')}${sc.suffix ?? ''}`, st.h / 2 - 4 * st.u + drift, 28 * st.u, env * seg(s, 0, 0.8));
  typewriter(st, sc.label.toLowerCase(), st.w / 2, st.h / 2 + 15 * st.u, s - 0.7, { size: 4.2 * st.u, alpha: env, color: st.pal.muted });
}

function heat({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'heat' }>) {
  const env = envelope(s, dur, FADE, FADE);
  const cols = 53;
  const g = heatGeometry(st, st.h / 2, st.w * 0.86, st.h * (st.portrait ? 0.3 : 0.34));
  const { cell } = g;
  // the searchlight sweeps through the weeks; what it has passed stays faintly lit
  const lc = lerp(-6, cols + 6, inOut(seg(s, 0.4, dur - 0.6)));
  const { ctx } = st;
  for (let c = 0; c < cols; c++) {
    const passed = c < lc ? 0.45 : 0;
    const light = clamp(1 - Math.abs(c - lc) / 7);
    for (let r = 0; r < 7; r++) {
      const level = sc.grid[c * 7 + r] ?? 0;
      const v = level ? 0.18 + level * 0.2 : 0.07;
      const { x, y } = g.pos(c, r);
      ctx.save();
      ctx.globalAlpha = env * clamp(Math.max(passed, light) * v + 0.04);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + cell * 0.12, y + cell * 0.12, cell * 0.76, cell * 0.76);
      ctx.restore();
    }
  }
  const beamAt = g.pos(clamp(Math.round(lc), 0, cols - 1), 3);
  const beam = ctx.createRadialGradient(beamAt.x, beamAt.y, 0, beamAt.x, beamAt.y, cell * 12);
  beam.addColorStop(0, 'rgba(255,255,255,0.10)');
  beam.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.save();
  ctx.globalAlpha = env * seg(lc, -6, 0) * (1 - seg(lc, cols, cols + 6));
  ctx.fillStyle = beam;
  ctx.fillRect(0, 0, st.w, st.h);
  ctx.restore();
  serif(st, String(sc.year), g.top - 9 * st.u, 7 * st.u, env * seg(s, 0, 0.8), { italic: true });
  typewriter(st, `${sc.total.toLocaleString('en')} entries in the ledger.`, st.w / 2, g.bottom + 9 * st.u, s - 1.0, { size: 4 * st.u, alpha: env, color: st.pal.muted, maxW: st.w * 0.86 });
}
const inOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

function clients({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'clients' }>) {
  const env = envelope(s, dur, FADE, FADE);
  const size = (st.portrait ? 4.6 : 4.2) * st.u;
  const lineH = size * 1.6;
  const block = Math.min(st.w * 0.7, 64 * st.u);
  const x = (st.w - block) / 2;
  const top = st.h / 2 - ((sc.names.length - 1) * lineH) / 2 + 4 * st.u;
  text(st, `CASE FILE · ${sc.names.length} KNOWN CLIENTS`, x, top - 17 * st.u, { size: 3 * st.u, font: MONO, align: 'left', track: 0.2, color: st.pal.muted, alpha: env * seg(s, 0, 0.6) });
  text(st, 'Known associates', x, top - 9 * st.u, { size: 7.5 * st.u, font: SERIF, italic: true, align: 'left', alpha: env * seg(s, 0.2, 0.9), maxW: block });
  let clock = 0.8;
  sc.names.forEach((name, i) => {
    const line = `${String(i + 1).padStart(2, '0')}  ${name}`;
    typewriter(st, line, x, top + i * lineH, s - clock, { size, align: 'left', alpha: env, cps: 40 });
    clock += line.length / 40 + 0.08;
  });
}

function dossier(st: Stage, s: number, env: number, title: string, client: string | undefined, label: string, redact: boolean, impact?: string) {
  const { ctx } = st;
  const block = Math.min(st.w * 0.8, 70 * st.u);
  const x = (st.w - block) / 2;
  const top = st.h / 2 - (st.portrait ? 22 : 20) * st.u;
  text(st, label, x, top - 7 * st.u, { size: 3 * st.u, font: MONO, align: 'left', track: 0.2, color: st.pal.muted, alpha: env * seg(s, 0, 0.6) });
  text(st, title, x, top + 2 * st.u, { size: 9 * st.u, font: SERIF, align: 'left', alpha: env * seg(s, 0.2, 0.9), maxW: block });
  if (client) typewriter(st, `client: ${client}`, x, top + 10.5 * st.u, s - 0.8, { size: 3.6 * st.u, align: 'left', alpha: env, color: st.pal.muted });
  const lineH = 3.4 * st.u;
  const widths = [0.92, 0.7, 0.84, 0.55, 0.78];
  widths.forEach((wf, i) => {
    const y = top + 16 * st.u + i * lineH;
    ctx.save();
    ctx.globalAlpha = env * seg(s, 1.2 + i * 0.1, 1.5 + i * 0.1) * 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, block * wf, lineH * 0.3);
    ctx.restore();
    if (redact) {
      const cover = outCubic(seg(s, 1.9 + i * 0.16, 2.2 + i * 0.16));
      if (cover > 0) {
        ctx.save();
        ctx.globalAlpha = env;
        ctx.fillStyle = '#000000';
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 0.15 * st.u;
        ctx.fillRect(x - 0.5 * st.u, y - lineH * 0.25, (block * wf + st.u) * cover, lineH * 0.8);
        ctx.strokeRect(x - 0.5 * st.u, y - lineH * 0.25, (block * wf + st.u) * cover, lineH * 0.8);
        ctx.restore();
      }
    }
  });
  const after = top + 16 * st.u + widths.length * lineH;
  if (redact) {
    const sp = seg(s, 2.9, 3.15);
    if (sp > 0) {
      ctx.save();
      ctx.translate(st.w / 2 + block * 0.18, after - 9 * st.u);
      ctx.rotate(-0.16);
      const k = lerp(1.6, 1, outCubic(sp));
      ctx.scale(k, k);
      ctx.globalAlpha = env * sp * 0.92;
      const o = { size: 5 * st.u, font: SERIF, track: 0.12, color: '#ffffff' };
      const sw = measure(st, 'CONFIDENTIAL', o) + 5 * st.u;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5 * st.u;
      ctx.strokeRect(-sw / 2, -4.2 * st.u, sw, 8.4 * st.u);
      text(st, 'CONFIDENTIAL', 0, 0.3 * st.u, o);
      ctx.restore();
    }
  }
  if (impact) typewriter(st, `outcome: ${impact}`, x, after + 8 * st.u, s - (redact ? 3.3 : 1.2), { size: 4.4 * st.u, align: 'left', alpha: env, maxW: block });
}

function nda({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'nda' }>) {
  dossier(st, s, envelope(s, dur, FADE, FADE), sc.title, sc.client, 'EXHIBIT A · UNDER NDA', true, sc.impact);
}

function work({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'work' }>) {
  dossier(st, s, envelope(s, dur, FADE, FADE), sc.title, sc.client, 'EXHIBIT B · ON THE RECORD', false, sc.impact);
}

function cameos({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'cameos' }>) {
  const env = envelope(s, dur, FADE, FADE);
  serif(st, 'Also appearing in', st.portrait ? st.h / 2 - 34 * st.u : st.h / 2 - 24 * st.u, 7.5 * st.u, env * seg(s, 0, 0.9), { italic: true });
  const n = sc.items.length;
  const cols = st.portrait ? 1 : n;
  const maxW = st.w * 0.84;
  const cellW = maxW / cols;
  const logo = Math.min(st.portrait ? 10 * st.u : 12 * st.u, cellW * 0.38);
  const { ctx } = st;
  sc.items.forEach((it, i) => {
    const a = env * seg(s, 0.6 + i * 0.35, 1.2 + i * 0.35);
    if (a <= 0) return;
    const im = st.img(it.logo);
    const cx = st.portrait ? st.w / 2 - maxW / 2 + logo / 2 : st.w / 2 - maxW / 2 + cellW * i + cellW / 2;
    const cy = st.portrait ? st.h / 2 - 14 * st.u + i * 15 * st.u : st.h / 2 - 2 * st.u;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.beginPath();
    ctx.arc(cx, cy, logo / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    if (im) {
      ctx.clip();
      ctx.filter = 'grayscale(1) contrast(1.15)';
      ctx.drawImage(im, cx - logo / 2, cy - logo / 2, logo, logo);
      ctx.filter = 'none';
    }
    ctx.restore();
    if (!im) text(st, it.repo.replace(/^.*\//, '').slice(0, 1).toUpperCase(), cx, cy, { size: logo * 0.5, font: SERIF, alpha: a });
    const label = it.repo + (it.stars ? ` · ★ ${compactNumber(it.stars)}` : '');
    if (st.portrait) {
      text(st, label, cx + logo / 2 + 4 * st.u, cy - 2 * st.u, { size: 3.2 * st.u, font: MONO, align: 'left', alpha: a, maxW: maxW - logo - 4 * st.u });
      text(st, it.what, cx + logo / 2 + 4 * st.u, cy + 2.6 * st.u, { size: 3.4 * st.u, font: SERIF, italic: true, align: 'left', alpha: a, color: st.pal.muted, maxW: maxW - logo - 4 * st.u });
    } else {
      text(st, label, cx, cy + logo / 2 + 5.5 * st.u, { size: 3.4 * st.u, font: MONO, alpha: a, maxW: cellW * 0.92 });
      const lines = wrap(st, it.what, cellW * 0.86, { size: 4 * st.u, font: SERIF, italic: true }).slice(0, 2);
      lines.forEach((l, j) => text(st, l, cx, cy + logo / 2 + 11.5 * st.u + j * 4.8 * st.u, { size: 4 * st.u, font: SERIF, italic: true, alpha: a, color: st.pal.muted, maxW: cellW * 0.92 }));
    }
  });
}

function accolade({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'accolade' }>) {
  const env = envelope(s, dur, FADE, FADE);
  serif(st, sc.talk ? 'On the record.' : 'Decorated.', st.h / 2 - 16 * st.u, 6 * st.u, env * seg(s, 0, 0.8), { italic: true, color: st.pal.muted });
  const lines = wrap(st, sc.talk ? sc.title : sc.title, st.w * 0.8, { size: 9 * st.u, font: SERIF }).slice(0, 3);
  lines.forEach((l, i) => serif(st, l, st.h / 2 + (i - (lines.length - 1) / 2) * 10 * st.u + 2 * st.u, 9 * st.u, env * seg(s, 0.5, 1.3)));
  const sub = [sc.by, sc.year].filter(Boolean).join(', ');
  if (sub) typewriter(st, sub, st.w / 2, st.h / 2 + (lines.length / 2) * 10 * st.u + 8 * st.u, s - 1.2, { size: 3.8 * st.u, alpha: env, color: st.pal.muted, maxW: st.w * 0.86 });
}

function quote({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'quote' }>) {
  const env = envelope(s, dur, FADE, FADE);
  const k = lerp(1, 1.04, seg(s, 0, dur));
  const size = (st.portrait ? 6.4 : 6.2) * st.u;
  const lines = wrap(st, `“${sc.quote}”`, st.w * 0.78, { size, font: SERIF, italic: true }).slice(0, 5);
  scaled(st, st.w / 2, st.h / 2, k, () =>
    lines.forEach((l, i) => text(st, l, st.w / 2, st.h / 2 - 3 * st.u + (i - (lines.length - 1) / 2) * size * 1.3, { size, font: SERIF, italic: true, alpha: env * seg(s, 0.2 + i * 0.25, 1.0 + i * 0.25) })),
  );
  typewriter(st, `— ${[sc.name, sc.role].filter(Boolean).join(', ')}`, st.w / 2, st.h / 2 + (lines.length / 2) * size * 1.3 + 5 * st.u, s - 1.6, { size: 3.8 * st.u, alpha: env, color: st.pal.muted, maxW: st.w * 0.86 });
}

function title({ st, s }: SceneCtx, sc: Extract<Scene, { kind: 'title' }>) {
  const fin = seg(s, 0, FADE * 1.6);
  serif(st, 'Starring', st.h / 2 - 17 * st.u, 6.5 * st.u, fin, { italic: true, color: st.pal.muted });
  const name = [sc.first, sc.last].filter(Boolean).join(' ');
  serif(st, name, st.h / 2 + 0.5 * st.u, (st.portrait ? 13 : 15) * st.u, seg(s, 0.6, 1.8), { maxW: st.w * 0.86 });
  if (sc.role) typewriter(st, sc.role, st.w / 2, st.h / 2 + 14 * st.u, s - 1.8, { size: 4 * st.u, color: st.pal.muted, maxW: st.w * 0.86 });
  text(st, sc.url, st.w / 2, st.h / 2 + 24 * st.u, { size: 3.6 * st.u, font: MONO, track: 0.08, alpha: seg(s, 3.0, 3.6), maxW: st.w * 0.86 });
}

function outro({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'outro' }>) {
  const env = envelope(s, dur, FADE, 0);
  const h = (st.portrait ? 12 : 11) * st.u;
  const cy = st.h / 2 - 5 * st.u;
  // the brand in black and white: a bone tile, an ink star
  lockup(st, cy, h, {
    tile: st.pal.fg, star: st.pal.bg, word: st.pal.fg, font: "'Space Grotesk', system-ui, sans-serif", alpha: env,
    pop: outCubic(seg(s, 0.2, 1.0)), spin: outCubic(seg(s, 0.4, 1.3)), reveal: seg(s, 0.9, 1.6),
  });
  typewriter(st, `make your own → ${sc.site}`, st.w / 2, cy + h * 0.5 + 10 * st.u, s - 1.6, { size: 3.8 * st.u, alpha: env, color: st.pal.muted, maxW: st.w * 0.86 });
}

const SCENES: { [K in Scene['kind']]: (c: SceneCtx, sc: Extract<Scene, { kind: K }>) => void } = { open, stat, heat, clients, nda, work, cameos, accolade, quote, title, outro };

// ---- film: grain, flicker, scratches, vignette ----

let grain: HTMLCanvasElement | OffscreenCanvas | null = null;
const grainTile = () => {
  if (grain) return grain;
  const size = 256;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = Math.floor(hash(i + 17) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return (grain = c);
};

const noir: Genre = {
  id: 'noir',
  label: 'Noir',
  blurb: 'Black and white, a typewriter, a case file.',
  speed: 1.15,
  fonts: [`400 40px ${SERIF}`, `italic 400 40px ${SERIF}`, `400 40px ${MONO}`],
  palette: () => ({ bg: '#0a0a0a', fg: '#ecebe6', muted: '#8f8d87', accent: '#ffffff', line: '#1c1c1c' }),
  scene: (c, sc) => (SCENES[sc.kind] as (c: SceneCtx, sc: Scene) => void)(c, sc),
  overlay: (st) => {
    const { ctx } = st;
    const frame = Math.floor(st.t * 24);
    // grain: the same noise tile, jumping around every frame (24 fps, like film)
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = 'overlay';
    const tile = grainTile();
    const pattern = ctx.createPattern(tile as CanvasImageSource, 'repeat')!;
    const ox = Math.floor(hash(frame) * 256);
    const oy = Math.floor(hash(frame + 999) * 256);
    ctx.translate(-ox, -oy);
    ctx.scale(Math.max(1, st.u / 6), Math.max(1, st.u / 6));
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, st.w + 512, st.h + 512);
    ctx.restore();
    // a scratch now and then
    if (hash(frame * 7) > 0.86) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(hash(frame * 13) * st.w, 0, Math.max(1, st.u * 0.12), st.h);
      ctx.restore();
    }
    // flicker
    ctx.save();
    ctx.globalAlpha = 0.04 + 0.03 * (Math.sin(st.t * 31) * 0.5 + Math.sin(st.t * 17.3) * 0.5);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, st.w, st.h);
    ctx.restore();
    // vignette
    const g = ctx.createRadialGradient(st.w / 2, st.h / 2, Math.min(st.w, st.h) * 0.3, st.w / 2, st.h / 2, Math.max(st.w, st.h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, st.w, st.h);
  },
};

export default noir;
