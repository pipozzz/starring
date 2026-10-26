// BLOCKBUSTER — the summer-tentpole trailer: letterbox, booming condensed titles, numbers that
// count up, hard cuts with a flash, festival laurels and five-star critics. The profile's theme
// lends its accent colour.

import type { Scene } from '../script';
import {
  clamp, compactNumber, envelope, heatGeometry, lerp, measure, outBack, outCubic, outExpo, roundRect, scaled, seg, text, wrap,
  type Genre, type SceneCtx, type Stage,
} from '../engine';

const DISPLAY = "'Anton', Impact, sans-serif";
const BODY = "'Space Grotesk', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, monospace";

/** Relative luminance, 0 (black) – 1 (white). */
const lum = (hex: string) => {
  const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex.trim());
  if (!m) return 0.5;
  const [r, g, b] = m.slice(1).map((x) => {
    const c = parseInt(x, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** A highlight that sweeps across text from left to right as `x` goes 0 → 1. */
const sheen = (st: Stage, cx: number, width: number, x: number, base: string) => {
  const g = st.ctx.createLinearGradient(cx - width / 2, 0, cx + width / 2, 0);
  const at = lerp(-0.2, 1.2, x);
  g.addColorStop(0, base);
  g.addColorStop(clamp(at - 0.12), base);
  g.addColorStop(clamp(at), '#ffffff');
  g.addColorStop(clamp(at + 0.12), base);
  g.addColorStop(1, base);
  return g;
};

const kicker = (st: Stage, str: string, y: number, alpha = 1, color?: string) =>
  text(st, str, st.w / 2, y, { size: 3.2 * st.u, font: MONO, track: 0.28, upper: true, alpha, color: color ?? st.pal.muted, maxW: st.w * 0.9 });

/** The safe picture area inside the letterbox. */
const frame = (st: Stage) => {
  const bar = st.portrait || st.w / st.h < 1.5 ? 0 : Math.max(0, (st.h - st.w / 2.39) / 2);
  return { top: bar, bottom: st.h - bar, mid: st.h / 2, maxW: st.w * (st.portrait ? 0.86 : 0.8) };
};

function open({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'open' }>) {
  const f = frame(st);
  const [a, b] = sc.privateShare >= 50 ? ['In a world where', `${sc.privateShare}% of the work is private…`] : ['This season', 'one career, told properly'];
  const env = envelope(s, dur, 0.5, 0.35);
  const lines = wrap(st, b.toUpperCase(), f.maxW, { size: 11 * st.u, font: DISPLAY });
  kicker(st, a, f.mid + 4 * st.u - (lines.length / 2) * 11.5 * st.u - 5 * st.u, env * seg(s, 0.2, 0.9));
  const p = seg(s, 1.0, dur);
  const k = lerp(1.08, 1, outCubic(p));
  scaled(st, st.w / 2, f.mid + 4 * st.u, k, () => {
    lines.forEach((line, i) => {
      const y = f.mid + 4 * st.u + (i - (lines.length - 1) / 2) * 11.5 * st.u;
      text(st, line, st.w / 2, y, { size: 11 * st.u, font: DISPLAY, maxW: f.maxW, alpha: env * seg(s, 1.0, 1.5), color: sheen(st, st.w / 2, f.maxW, seg(s, 1.4, 2.6), st.pal.fg) });
    });
  });
}

function stat({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'stat' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.06, 0.2);
  const v = Math.round(sc.value * outExpo(seg(s, 0.05, 1.1)));
  const k = lerp(1.3, 1, outBack(seg(s, 0, 0.4)));
  scaled(st, st.w / 2, f.mid - 3 * st.u, k, () => {
    text(st, `${v.toLocaleString('en')}${sc.suffix ?? ''}`, st.w / 2, f.mid - 3 * st.u, { size: 30 * st.u, font: DISPLAY, color: st.pal.accent, maxW: f.maxW, alpha: env });
  });
  text(st, sc.label, st.w / 2, f.mid + 17 * st.u, { size: 4.2 * st.u, font: BODY, weight: 700, track: 0.22, upper: true, alpha: env * seg(s, 0.35, 0.8), maxW: f.maxW });
}

function heat({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'heat' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.15, 0.3);
  const cols = 53;
  const g = heatGeometry(st, f.mid, st.w * 0.88, (f.bottom - f.top) * (st.portrait ? 0.3 : 0.36));
  const { cell } = g;
  const sweep = seg(s, 0.3, 2.0);
  const { ctx } = st;
  ctx.save();
  for (let c = 0; c < cols; c++) {
    const on = seg(sweep * (cols + 6) - c, 0, 6);
    for (let r = 0; r < 7; r++) {
      const level = sc.grid[c * 7 + r] ?? 0;
      const { x, y } = g.pos(c, r);
      ctx.fillStyle = level && on > 0 ? st.pal.accent : st.pal.line;
      ctx.globalAlpha = env * (level && on > 0 ? [0, 0.28, 0.5, 0.75, 1][level] * on : 1);
      roundRect(ctx, x + cell * 0.1, y + cell * 0.1, cell * 0.8, cell * 0.8, cell * 0.18);
      ctx.fill();
    }
  }
  ctx.restore();
  text(st, String(sc.year), st.w / 2, g.top - 8 * st.u, { size: 7 * st.u, font: DISPLAY, alpha: env * seg(s, 0, 0.4) });
  const n = Math.round(sc.total * outExpo(seg(s, 0.3, 2.0)));
  text(st, `${n.toLocaleString('en')} contributions`, st.w / 2, g.bottom + 7 * st.u, { size: 5 * st.u, font: BODY, weight: 700, color: st.pal.accent, alpha: env, maxW: f.maxW });
  kicker(st, 'Every one of them counted', g.bottom + 13 * st.u, env * seg(s, 1.6, 2.2));
}

function clients({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'clients' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.1, 0.3);
  const fire = sc.names.length > 1 ? dur * 0.58 : 0;
  kicker(st, sc.names.length > 1 ? 'Trusted by' : 'Trusted by', f.top + 12 * st.u, env * seg(s, 0, 0.3));
  if (s < fire) {
    const slot = fire / sc.names.length;
    const i = Math.min(sc.names.length - 1, Math.floor(s / slot));
    const ls = s - i * slot;
    const k = lerp(1.14, 1, outCubic(seg(ls, 0, slot)));
    scaled(st, st.w / 2, f.mid, k, () => {
      text(st, sc.names[i], st.w / 2, f.mid, { size: 13 * st.u, font: DISPLAY, upper: true, maxW: f.maxW, alpha: env * seg(ls, 0, 0.06) });
    });
    // a cut flash between names
    if (i > 0) flash(st, 1 - seg(ls, 0, 0.1), 0.35);
    return;
  }
  const ps = s - fire;
  const o = { size: (st.portrait ? 6.4 : 6.2) * st.u, font: DISPLAY, upper: true };
  const lines = wrap(st, sc.names.join('  ·  ').toUpperCase(), f.maxW, o).slice(0, 5);
  lines.forEach((line, i) => {
    text(st, line, st.w / 2, f.mid + (i - (lines.length - 1) / 2) * o.size * 1.5, { ...o, alpha: env * seg(ps, i * 0.12, i * 0.12 + 0.4) });
  });
}

function nda({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'nda' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.1, 0.3);
  const top = st.portrait ? f.mid - 28 * st.u : f.mid - 22 * st.u;
  if (sc.client) kicker(st, `For ${sc.client}`, top - 7 * st.u, env * seg(s, 0, 0.4));
  text(st, sc.title, st.w / 2, top + 3 * st.u, { size: 9 * st.u, font: DISPLAY, upper: true, maxW: f.maxW, alpha: env * seg(s, 0.1, 0.5) });
  // "source code", then the redaction sweeps over it
  const { ctx } = st;
  const bw = Math.min(f.maxW, 70 * st.u);
  const bx = (st.w - bw) / 2;
  const by = top + 12 * st.u;
  const lineH = 3.6 * st.u;
  const widths = [0.62, 0.84, 0.46, 0.9, 0.7];
  const redact = seg(s, 1.0, 2.0);
  widths.forEach((wf, i) => {
    const y = by + i * lineH;
    const indent = (i % 3) * 3 * st.u;
    ctx.save();
    ctx.globalAlpha = env * seg(s, 0.4 + i * 0.08, 0.7 + i * 0.08) * 0.35;
    ctx.fillStyle = st.pal.muted;
    roundRect(ctx, bx + indent, y, (bw - indent) * wf, lineH * 0.42, lineH);
    ctx.fill();
    ctx.globalAlpha = env;
    ctx.fillStyle = st.pal.fg;
    const cover = clamp(redact * 1.4 - i * 0.08) * ((bw - indent) * wf + 1.2 * st.u);
    if (cover > 0) {
      ctx.fillRect(bx + indent - 0.6 * st.u, y - lineH * 0.16, cover, lineH * 0.74);
    }
    ctx.restore();
  });
  // the stamp
  const sp = seg(s, 2.0, 2.35);
  if (sp > 0) {
    const label = 'UNDER NDA';
    const o = { size: 7 * st.u, font: DISPLAY, track: 0.08, color: st.pal.accent };
    const sw = measure(st, label, o) + 6 * st.u;
    ctx.save();
    ctx.translate(st.w / 2, by + lineH * 2.2);
    ctx.rotate(-0.12);
    const k = lerp(1.8, 1, outCubic(sp));
    ctx.scale(k, k);
    ctx.globalAlpha = env * sp;
    roundRect(ctx, -sw / 2, -5.5 * st.u, sw, 11 * st.u, 1.2 * st.u);
    ctx.fillStyle = st.pal.bg;
    ctx.fill();
    ctx.strokeStyle = st.pal.accent;
    ctx.lineWidth = 0.8 * st.u;
    ctx.stroke();
    text(st, label, 0, 0.3 * st.u, o);
    ctx.restore();
  }
  if (sc.impact) {
    text(st, sc.impact, st.w / 2, by + lineH * 5 + 9 * st.u, { size: 7.5 * st.u, font: DISPLAY, upper: true, color: st.pal.accent, maxW: f.maxW, alpha: env * seg(s, 2.6, 3.0) });
    kicker(st, 'The code stays secret. The results don’t.', by + lineH * 5 + 16 * st.u, env * seg(s, 2.9, 3.3));
  }
}

function work({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'work' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.1, 0.3);
  kicker(st, sc.client ? `Featuring · ${sc.client}` : 'Featuring', f.mid - 14 * st.u, env * seg(s, 0, 0.4));
  const k = lerp(1.1, 1, outCubic(seg(s, 0, dur)));
  scaled(st, st.w / 2, f.mid - 2 * st.u, k, () =>
    text(st, sc.title, st.w / 2, f.mid - 2 * st.u, { size: 12 * st.u, font: DISPLAY, upper: true, maxW: f.maxW, alpha: env * seg(s, 0.15, 0.5), color: sheen(st, st.w / 2, f.maxW, seg(s, 0.5, 1.8), st.pal.fg) }),
  );
  if (sc.impact) text(st, sc.impact, st.w / 2, f.mid + 11 * st.u, { size: 5.5 * st.u, font: BODY, weight: 700, color: st.pal.accent, maxW: f.maxW, alpha: env * seg(s, 1.0, 1.4) });
}

function cameos({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'cameos' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.1, 0.3);
  const n = sc.items.length;
  kicker(st, 'Guest appearances', st.portrait ? f.mid - 40 * st.u : f.top + 12 * st.u, env * seg(s, 0, 0.3), st.pal.accent);
  const cols = st.portrait ? 1 : n;
  const rows = Math.ceil(n / cols);
  const cellW = f.maxW / cols;
  const cellH = st.portrait ? 16 * st.u : 34 * st.u;
  const logo = Math.min(st.portrait ? 11 * st.u : 14 * st.u, cellW * 0.4);
  const y0 = f.mid - (rows * cellH) / 2 + (st.portrait ? 0 : 4 * st.u);
  const { ctx } = st;
  sc.items.forEach((it, i) => {
    const pop = outBack(seg(s, 0.25 + i * 0.22, 0.65 + i * 0.22));
    if (pop <= 0) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const a = env * clamp(pop);
    if (st.portrait) {
      const x = st.w / 2 - f.maxW / 2;
      const cy = y0 + row * cellH + cellH / 2;
      drawLogo(st, it, x, cy - logo / 2, logo, a, pop);
      text(st, it.repo + (it.stars ? `  ★ ${compactNumber(it.stars)}` : ''), x + logo + 4 * st.u, cy - 2.6 * st.u, { size: 4.2 * st.u, font: MONO, align: 'left', alpha: a, maxW: f.maxW - logo - 4 * st.u });
      text(st, it.what, x + logo + 4 * st.u, cy + 3 * st.u, { size: 4 * st.u, font: BODY, align: 'left', color: st.pal.muted, alpha: a, maxW: f.maxW - logo - 4 * st.u });
      return;
    }
    const cx = st.w / 2 - f.maxW / 2 + cellW * col + cellW / 2;
    const top = y0 + row * cellH;
    scaled(st, cx, top + logo / 2, clamp(pop, 0, 1.2), () => drawLogo(st, it, cx - logo / 2, top, logo, a, 1));
    ctx.save();
    text(st, it.repo, cx, top + logo + 5.5 * st.u, { size: 3.8 * st.u, font: MONO, alpha: a, maxW: cellW * 0.9 });
    const lines = wrap(st, it.what, cellW * 0.86, { size: 4 * st.u, font: BODY, weight: 700 }).slice(0, 2);
    lines.forEach((l, j) => text(st, l, cx, top + logo + 11.5 * st.u + j * 5 * st.u, { size: 4 * st.u, font: BODY, weight: 700, color: st.pal.muted, alpha: a, maxW: cellW * 0.9 }));
    if (it.stars) text(st, `★ ${compactNumber(it.stars)}`, cx, top + logo + (lines.length > 1 ? 22.5 : 17.5) * st.u, { size: 4 * st.u, font: MONO, color: st.pal.accent, alpha: a });
    ctx.restore();
  });
}

function drawLogo(st: Stage, it: { repo: string; logo?: string }, x: number, y: number, size: number, alpha: number, _k: number) {
  const { ctx } = st;
  const im = st.img(it.logo);
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, size, size, size * 0.22);
  ctx.fillStyle = st.pal.line;
  ctx.fill();
  if (im) {
    ctx.clip();
    ctx.drawImage(im, x, y, size, size);
  } else {
    ctx.restore();
    text(st, it.repo.replace(/^.*\//, '').slice(0, 1).toUpperCase(), x + size / 2, y + size / 2, { size: size * 0.55, font: DISPLAY, color: st.pal.accent, alpha });
    return;
  }
  ctx.restore();
}

/** Two laurel branches around (cx, cy), growing leaf by leaf from the bottom as `p` goes 0 → 1. */
function laurels(st: Stage, cx: number, cy: number, r: number, p: number, alpha: number) {
  const { ctx } = st;
  const leaves = 8;
  for (const side of [1, -1]) {
    ctx.save();
    // draw the left branch; the right one is its mirror image
    ctx.translate(cx, cy);
    ctx.scale(side, 1);
    ctx.fillStyle = st.pal.accent;
    ctx.strokeStyle = st.pal.accent;
    ctx.lineWidth = r * 0.018;
    const from = Math.PI * 0.62;
    const to = lerp(from, Math.PI * 1.36, clamp(p * 1.15));
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(0, 0, r, from, to);
    ctx.stroke();
    for (let i = 0; i < leaves; i++) {
      const show = seg(p * (leaves + 2) - i, 0, 2);
      if (show <= 0) continue;
      const th = lerp(Math.PI * 0.66, Math.PI * 1.32, i / (leaves - 1));
      const size = r * lerp(0.2, 0.13, i / (leaves - 1)) * outBack(show);
      for (const out of [1, -1]) {
        const rr = r + out * r * 0.07;
        ctx.save();
        ctx.translate(Math.cos(th) * rr, Math.sin(th) * rr);
        // along the branch (pointing up it), tilted away from the stem
        ctx.rotate(th + Math.PI + out * 0.5);
        ctx.globalAlpha = alpha * clamp(show);
        ctx.beginPath();
        ctx.ellipse(0, -size * 0.5, size * 0.34, size * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

function accolade({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'accolade' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.15, 0.3);
  const r = Math.min((f.bottom - f.top) * 0.4, st.w * 0.36);
  laurels(st, st.w / 2, f.mid, r, seg(s, 0, 1.0), env);
  const inner = r * 1.3;
  const headline = sc.talk ? sc.by ?? sc.title : sc.title;
  const size = Math.min(7 * st.u, r * 0.2);
  const lines = wrap(st, headline.toUpperCase(), inner, { size, font: DISPLAY }).slice(0, 3);
  const lh = size * 1.08;
  const block = lines.length * lh;
  kicker(st, sc.talk ? 'As seen at' : 'Winner', f.mid - block / 2 - 4.5 * st.u, env * seg(s, 0.3, 0.7), st.pal.accent);
  lines.forEach((l, i) => text(st, l, st.w / 2, f.mid + (i - (lines.length - 1) / 2) * lh, { size, font: DISPLAY, maxW: inner, alpha: env * seg(s, 0.5, 0.9) }));
  const sub = sc.talk ? sc.title : [sc.by, sc.year].filter(Boolean).join(' · ');
  if (sub) text(st, sub, st.w / 2, f.mid + block / 2 + 4.5 * st.u, { size: 2.9 * st.u, font: MONO, color: st.pal.muted, maxW: inner, alpha: env * seg(s, 0.9, 1.3) });
}

function quote({ st, s, dur }: SceneCtx, sc: Extract<Scene, { kind: 'quote' }>) {
  const f = frame(st);
  const env = envelope(s, dur, 0.15, 0.3);
  for (let i = 0; i < 5; i++) {
    const k = outBack(seg(s, 0.1 + i * 0.1, 0.4 + i * 0.1));
    if (k <= 0) continue;
    const x = st.w / 2 + (i - 2) * 6 * st.u;
    scaled(st, x, f.mid - 17 * st.u, k, () => text(st, '★', x, f.mid - 17 * st.u, { size: 5 * st.u, font: BODY, color: st.pal.accent, alpha: env }));
  }
  const o = { size: (st.portrait ? 5.8 : 5.6) * st.u, font: BODY, weight: 700 };
  const lines = wrap(st, `“${sc.quote}”`, f.maxW * 0.9, o).slice(0, 5);
  lines.forEach((l, i) => text(st, l, st.w / 2, f.mid + (i - (lines.length - 1) / 2) * o.size * 1.35, { ...o, alpha: env * seg(s, 0.6 + i * 0.12, 1.0 + i * 0.12) }));
  kicker(st, [sc.name, sc.role].filter(Boolean).join(', '), f.mid + (lines.length / 2) * o.size * 1.35 + 7 * st.u, env * seg(s, 1.3, 1.7));
}

function title({ st, s }: SceneCtx, sc: Extract<Scene, { kind: 'title' }>) {
  const f = frame(st);
  const fin = seg(s, 0, 0.4);
  kicker(st, 'Now starring', f.mid - (sc.last ? 22 : 14) * st.u, fin, st.pal.accent);
  const size = (st.portrait ? 15 : 17) * st.u;
  const rise = (x: number) => (1 - outCubic(x)) * 6 * st.u;
  const p1 = seg(s, 0.3, 0.9);
  text(st, sc.first.toUpperCase(), st.w / 2, f.mid - (sc.last ? 7 : 0) * st.u + rise(p1), { size, font: DISPLAY, maxW: f.maxW, alpha: p1 });
  if (sc.last) {
    const p2 = seg(s, 0.55, 1.15);
    text(st, sc.last.toUpperCase(), st.w / 2, f.mid + 9 * st.u + rise(p2), { size, font: DISPLAY, maxW: f.maxW, alpha: p2, color: st.pal.accent });
  }
  const base = f.mid + (sc.last ? 22 : 13) * st.u;
  if (sc.role) text(st, sc.role, st.w / 2, base, { size: 4 * st.u, font: BODY, weight: 700, maxW: f.maxW, alpha: seg(s, 1.3, 1.7) });
  const pu = seg(s, 1.9, 2.4);
  const w = text(st, sc.url, st.w / 2, base + 8 * st.u, { size: 3.6 * st.u, font: MONO, color: st.pal.fg, alpha: pu, maxW: f.maxW }).w;
  st.ctx.save();
  st.ctx.fillStyle = st.pal.accent;
  st.ctx.globalAlpha = pu;
  st.ctx.fillRect(st.w / 2 - (w / 2) * outCubic(pu), base + 11 * st.u, w * outCubic(pu), 0.45 * st.u);
  st.ctx.restore();
}

/** A white flash; `x` 1 → 0 as it fades. */
function flash(st: Stage, x: number, max = 0.8) {
  if (x <= 0) return;
  st.ctx.save();
  st.ctx.globalAlpha = x * max;
  st.ctx.fillStyle = '#ffffff';
  st.ctx.fillRect(0, 0, st.w, st.h);
  st.ctx.restore();
}

const SCENES: { [K in Scene['kind']]: (c: SceneCtx, sc: Extract<Scene, { kind: K }>) => void } = { open, stat, heat, clients, nda, work, cameos, accolade, quote, title };
const FLASH_ON: Scene['kind'][] = ['stat', 'clients', 'nda', 'title'];

const blockbuster: Genre = {
  id: 'blockbuster',
  label: 'Blockbuster',
  blurb: 'Booming titles, hard cuts, festival laurels.',
  speed: 1,
  fonts: [`400 40px ${DISPLAY}`, `700 40px ${BODY}`, `400 40px ${MONO}`],
  palette: ({ accent }) => ({
    bg: '#060606',
    fg: '#f4f2eb',
    muted: '#9a978e',
    line: '#1d1d1b',
    // the theme's accent when it glows on black, else Starring acid
    accent: lum(accent) > 0.3 ? accent : '#d4ff00',
  }),
  scene: (c, sc) => {
    (SCENES[sc.kind] as (c: SceneCtx, sc: Scene) => void)(c, sc);
    if (c.index > 0 && FLASH_ON.includes(sc.kind)) flash(c.st, 1 - seg(c.s, 0, 0.14));
  },
  overlay: (st) => {
    const { ctx } = st;
    // vignette
    const g = ctx.createRadialGradient(st.w / 2, st.h / 2, Math.min(st.w, st.h) * 0.35, st.w / 2, st.h / 2, Math.max(st.w, st.h) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, st.w, st.h);
    // letterbox on wide formats
    const f = frame(st);
    if (f.top > 0) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, st.w, f.top);
      ctx.fillRect(0, f.bottom, st.w, st.h - f.bottom);
    }
  },
};

export default blockbuster;
