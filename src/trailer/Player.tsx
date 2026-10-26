import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import '@fontsource/anton/400.css';
import '@fontsource/space-grotesk/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/dm-serif-display/400-italic.css';
import type { Profile } from '../lib/model';
import { buildScript } from './script';
import { drawFrame, makeTrailer, preloadImages } from './engine';
import { GENRES, getGenre } from './genres';
import { FORMATS, canExport, exportMp4, type Format } from './export';
import './trailer.css';

interface Props {
  p: Profile;
  /** The stage's public address, shown on the title card. */
  url: string;
  /** This page's address, for sharing the trailer as a link. */
  trailerUrl: string;
  /** The Starring instance the end card points to. */
  site: string;
  theme: { accent: string; scheme: 'dark' | 'light' };
  genre?: string;
}

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function Player({ p, url, trailerUrl, site, theme, genre: initialGenre }: Props) {
  const [genreId, setGenreId] = useState(getGenre(initialGenre).id);
  const [format, setFormat] = useState<Format>('landscape');
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [ready, setReady] = useState(false);
  const [exporting, setExporting] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [canShareFiles, setCanShareFiles] = useState(false);
  /** The last video made, so Share after Download (or twice) doesn't render it again. */
  const made = useRef<{ key: string; file: File } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const images = useRef(new Map<string, HTMLImageElement>());
  const abort = useRef<AbortController | null>(null);
  const clock = useRef({ t: 0, last: 0 });

  const genre = getGenre(genreId);
  const scenes = useMemo(() => buildScript(p, url, site), [p, url, site]);
  const tr = useMemo(() => makeTrailer(scenes, genre), [scenes, genre]);
  const pal = useMemo(() => genre.palette(theme), [genre, theme]);
  const img = useCallback((u?: string) => (u ? images.current.get(u) : undefined), []);
  const { w, h } = FORMATS[format];

  // fonts and logos first, so the first frame is already right
  useEffect(() => {
    let live = true;
    Promise.all([
      Promise.all(GENRES.flatMap((g) => g.fonts).map((f) => document.fonts.load(f).catch(() => null))),
      preloadImages(scenes).then((m) => { images.current = m; }),
    ]).then(() => {
      if (!live) return;
      setReady(true);
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (still) { clock.current.t = tr.total - 0.01; setT(tr.total - 0.01); } else setPlaying(true);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenes]);

  useEffect(() => { canExport(format).then(setSupported); }, [format]);
  useEffect(() => {
    // native share sheets that take files: phones, Safari, Chrome on macOS and Windows
    try {
      setCanShareFiles(!!navigator.canShare?.({ files: [new File([new Uint8Array(1)], 'x.mp4', { type: 'video/mp4' })] }));
    } catch { /* not supported */ }
  }, []);

  const paint = useCallback((time: number) => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext('2d', { alpha: false });
    if (ctx) drawFrame(ctx, c.width, c.height, time, tr, pal, img);
  }, [tr, pal, img]);

  // the preview canvas: the format's aspect, sized to the screen
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const scale = Math.min(1, 1280 / Math.max(w, h)) * Math.min(2, devicePixelRatio || 1) * 0.75;
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    paint(clock.current.t);
  }, [w, h, paint]);

  useEffect(() => {
    if (!ready || !playing) { paint(clock.current.t); return; }
    let raf = 0;
    clock.current.last = performance.now();
    const tick = (now: number) => {
      const dt = (now - clock.current.last) / 1000;
      clock.current.last = now;
      clock.current.t = Math.min(tr.total, clock.current.t + dt);
      paint(clock.current.t);
      setT(clock.current.t);
      if (clock.current.t >= tr.total) { setPlaying(false); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ready, playing, paint, tr.total]);

  const seek = (time: number) => { clock.current.t = time; setT(time); paint(time); };
  const toggle = () => {
    if (!playing && clock.current.t >= tr.total - 0.05) seek(0);
    setPlaying(!playing);
  };
  const pickGenre = (id: string) => { setGenreId(id); seek(0); setPlaying(true); };

  const name = `${p.handle}-trailer-${genre.id}-${FORMATS[format].label.replace(':', 'x')}.mp4`;
  const pitch = `My developer career as a 30-second trailer — including the work GitHub can't show.`;

  /** Renders the MP4 (or reuses the last one for the same cut and format). */
  const make = async (): Promise<File | null> => {
    const key = `${genre.id}:${format}`;
    if (made.current?.key === key) return made.current.file;
    setError('');
    setPlaying(false);
    abort.current = new AbortController();
    setExporting(0);
    try {
      const blob = await exportMp4(tr, pal, img, format, setExporting, abort.current.signal);
      const file = new File([blob], name, { type: 'video/mp4' });
      made.current = { key, file };
      return file;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(`Couldn't make the video: ${(e as Error).message}`);
      return null;
    } finally {
      setExporting(null);
    }
  };

  const download = async () => {
    const file = await make();
    if (!file) return;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(file), download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  };

  const shareVideo = async () => {
    const file = await make();
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: `${p.profile.name} — the trailer`, text: `${pitch} ${trailerUrl}` });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setError(`Sharing didn't work here — download the video and post it instead.`);
    }
  };

  const copyLink = () => navigator.clipboard.writeText(trailerUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); });
  const shareTo = [
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(trailerUrl)}` },
    { label: 'X', href: `https://x.com/intent/post?text=${encodeURIComponent(pitch)}&url=${encodeURIComponent(trailerUrl)}` },
    { label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${pitch} ${trailerUrl}`)}` },
  ];

  return (
    <div className="tr">
      <div className={`tr-screen tr-${format}`}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${p.profile.name}'s career trailer, ${genre.label} cut. The transcript is below.`}
          onClick={toggle}
        />
        {!playing && ready && (
          <button type="button" className="tr-big-play" onClick={toggle} aria-label={t >= tr.total - 0.05 ? 'Replay the trailer' : 'Play the trailer'}>
            {t >= tr.total - 0.05 ? '↻' : '▶'}
          </button>
        )}
      </div>

      <div className="tr-bar">
        <button type="button" className="tr-btn" onClick={toggle} disabled={!ready} aria-label={playing ? 'Pause' : 'Play'}>{playing ? '❚❚' : '▶'}</button>
        <input
          type="range" min={0} max={tr.total} step={0.01} value={t}
          onChange={(e) => { setPlaying(false); seek(Number(e.target.value)); }}
          aria-label="Position in the trailer" className="tr-seek"
        />
        <span className="tr-time">{fmtTime(t)} / {fmtTime(tr.total)}</span>
      </div>

      <div className="tr-controls">
        <fieldset className="tr-group">
          <legend>Genre</legend>
          {GENRES.map((g) => (
            <label key={g.id} className={g.id === genreId ? 'on' : ''}>
              <input type="radio" name="genre" checked={g.id === genreId} onChange={() => pickGenre(g.id)} />
              <b>{g.label}</b>
              <span>{g.blurb}</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="tr-group">
          <legend>Format</legend>
          {(Object.keys(FORMATS) as Format[]).map((f) => (
            <label key={f} className={f === format ? 'on' : ''}>
              <input type="radio" name="format" checked={f === format} onChange={() => setFormat(f)} />
              <b>{FORMATS[f].label}</b>
              <span>{FORMATS[f].hint}</span>
            </label>
          ))}
        </fieldset>
      </div>

      <div className="tr-export">
        {exporting === null ? (
          <>
            <button type="button" className="tr-btn tr-primary" onClick={download} disabled={!ready || supported === false}>
              Download MP4 · {FORMATS[format].label}
            </button>
            {canShareFiles && (
              <button type="button" className="tr-btn" onClick={shareVideo} disabled={!ready || supported === false}>
                Share video…
              </button>
            )}
          </>
        ) : (
          <>
            <div className="tr-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(exporting * 100)} aria-label="Making the video">
              <span style={{ width: `${exporting * 100}%` }} />
            </div>
            <span className="tr-time">{Math.round(exporting * 100)}%</span>
            <button type="button" className="tr-btn" onClick={() => abort.current?.abort()}>Cancel</button>
          </>
        )}
        <p className="tr-hint">
          {supported === false
            ? 'This browser can’t make MP4 files yet — try a recent Chrome, Edge or Safari.'
            : `Made right here in your browser, nothing is uploaded. ${Math.round(tr.total)} seconds, ${FORMATS[format].w}×${FORMATS[format].h}, silent — add music in LinkedIn, Instagram or CapCut if you like.`}
        </p>
        {error && <p className="tr-error" role="alert">{error}</p>}
      </div>

      <div className="tr-share">
        <h2 className="tr-legend">Share the link</h2>
        <p className="tr-hint">Anyone who opens it watches the trailer right here — no download, no app.</p>
        <div className="tr-link">
          <input className="tr-input" value={trailerUrl} readOnly aria-label="Link to this trailer" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="tr-btn" onClick={copyLink}>{copied ? 'Copied ✓' : 'Copy link'}</button>
        </div>
        <div className="tr-row">
          {shareTo.map((x) => <a key={x.label} className="tr-btn" href={x.href} target="_blank" rel="noreferrer">{x.label} ↗</a>)}
        </div>
      </div>
    </div>
  );
}
