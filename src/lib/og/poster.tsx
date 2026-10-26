// The social preview "movie poster" (1200×630) for a profile, rendered with satori.
// satori supports a flexbox subset of CSS: every element with several children
// needs display:flex, and there is no grid.
import { totals, type Profile } from '../model';
import { getTheme } from '../../themes';

const ANTON = 'Anton, Anton Ext';
const GROTESK = 'Space Grotesk, Space Grotesk Ext';
const MONO = 'JetBrains Mono, JetBrains Mono Ext';

const W = 1200;
const H = 630;

/** Fit the longest name line to the width (Anton ≈ 0.43em per glyph) and two lines to the height budget. */
const nameSize = (lines: string[], roomy: boolean) => {
  const longest = Math.max(...lines.map((l) => l.length), 4);
  const byWidth = Math.floor((W - 120) / (longest * 0.43));
  const byHeight = roomy ? 170 : 140;
  return Math.max(72, Math.min(byWidth, byHeight));
};

/** `photo` is a data: URL — the route reads it from storage, never from the network. */
export function ProfilePoster({ p, host, photo }: { p: Profile; host: string; photo?: string }) {
  const t = getTheme(p.theme).tokens;
  const me = p.profile;
  const [first, ...rest] = (me.name || 'Your Name').toUpperCase().split(' ');
  const lines = [first, rest.join(' ')].filter(Boolean);
  const s = totals(p);
  const stats = [
    s.years > 0 && [String(s.years), 'years shipping'],
    s.all > 0 && [s.all.toLocaleString('en'), 'commits'],
    s.clients > 0 && [String(s.clients), 'clients'],
    s.all > 0 && [`${s.privateShare}%`, 'in private repos'],
  ].filter(Boolean) as [string, string][];
  const billing = (p.clients ?? []).map((c) => c.name).filter(Boolean).slice(0, 5);
  const size = Math.round(nameSize(lines, !billing.length || !stats.length) * (photo ? 0.7 : 1));
  const PW = 380;

  return (
    <div style={{ width: W, height: H, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', background: t.bg, color: t.fg, padding: photo ? `44px ${PW + 30}px 40px 60px` : '44px 60px 40px', fontFamily: GROTESK, position: 'relative' }}>
      {photo && (
        <div style={{ position: 'absolute', right: 0, top: 0, width: PW, height: H, display: 'flex' }}>
          <img src={photo} width={PW} height={H} style={{ width: PW, height: H, objectFit: 'cover' }} />
          <div style={{ position: 'absolute', left: 0, top: 0, width: PW, height: H, display: 'flex', backgroundImage: `linear-gradient(90deg, ${t.bg} 0%, ${t.bg}00 45%)` }} />
        </div>
      )}
      <div style={{ position: 'absolute', left: 0, top: 0, width: W, height: 10, background: t.accent, display: 'flex' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 20, letterSpacing: 2, textTransform: 'uppercase' }}>
        <span style={{ color: t.accent }}>Now starring</span>
        <span style={{ color: t.muted, whiteSpace: 'nowrap' }}>{`${host}/${p.handle}`}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 14, fontFamily: ANTON, fontSize: size, lineHeight: 0.92 }}>
        {lines.map((l, i) => (
          <span key={i} style={{ color: i === 0 ? t.fg : t.accent }}>{l}</span>
        ))}
      </div>

      <div style={{ display: 'flex', marginTop: 14, fontSize: 32, fontWeight: 700 }}>{me.role}</div>

      <div style={{ display: 'flex', flex: 1 }} />

      {stats.length > 0 && (
        <div style={{ display: 'flex', gap: photo ? 30 : 54, alignItems: 'flex-end' }}>
          {stats.map(([v, l]) => (
            <div key={l} style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: ANTON, fontSize: 58, lineHeight: 1, color: l === 'in private repos' ? t.accent : t.fg }}>{v}</span>
              <span style={{ fontFamily: MONO, fontSize: 17, letterSpacing: 2, textTransform: 'uppercase', color: t.muted, marginTop: 6 }}>{l}</span>
            </div>
          ))}
        </div>
      )}

      {billing.length > 0 && (
        <div style={{ display: 'flex', marginTop: 20, paddingTop: 14, borderTop: `2px solid ${t.line}`, fontFamily: MONO, fontSize: 16, letterSpacing: 2, textTransform: 'uppercase', color: t.muted, whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {`With work for  ${billing.join('  ·  ')}`}
        </div>
      )}
    </div>
  );
}

export function SitePoster({ host }: { host: string }) {
  const t = getTheme('acid').tokens;
  return (
    <div style={{ width: W, height: H, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: t.bg, color: t.fg, padding: '56px 64px', fontFamily: GROTESK }}>
      <div style={{ display: 'flex', fontFamily: MONO, fontSize: 22, letterSpacing: 2, textTransform: 'uppercase', color: t.accent }}>Open source · {host}</div>
      <div style={{ display: 'flex', flexDirection: 'column', fontFamily: ANTON, fontSize: 190, lineHeight: 0.86 }}>
        <span>NOW</span>
        <span style={{ color: t.accent }}>STARRING</span>
      </div>
      <div style={{ display: 'flex', fontSize: 34, fontWeight: 500, maxWidth: 980 }}>
        Your developer career as a scroll story, including the work GitHub can’t show.
      </div>
    </div>
  );
}
