import { useEffect, useState } from 'react';
import type { Profile } from '../lib/model';

interface Props {
  p: Profile;
  /** Absolute URL of the published stage. */
  url: string;
  /** Absolute URL of its poster (og image). */
  poster: string;
  onClose: () => void;
}

/** Right after publishing: the ways to put the stage where people will see it. */
export default function ShareDialog({ p, url, poster, onClose }: Props) {
  const [copied, setCopied] = useState('');
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [onClose]);

  const copy = (id: string, text: string) =>
    navigator.clipboard.writeText(text).then(() => { setCopied(id); setTimeout(() => setCopied((c) => (c === id ? '' : c)), 1800); });
  const name = p.profile.name;
  const pitch = `My developer career as a scroll story — including the work GitHub can't show.`;
  const share = [
    { label: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { label: 'X', href: `https://x.com/intent/post?text=${encodeURIComponent(pitch)}&url=${encodeURIComponent(url)}` },
    { label: 'Bluesky', href: `https://bsky.app/intent/compose?text=${encodeURIComponent(`${pitch} ${url}`)}` },
  ];
  const snippets = [
    {
      id: 'readme',
      title: 'GitHub profile README',
      hint: 'Your poster, linked to your stage — paste it into github.com/<you>/<you>/README.md.',
      text: `[![${name} — on Starring](${poster})](${url})`,
    },
    { id: 'signature', title: 'Email signature', hint: 'One line under your name.', text: `${name} · ${p.profile.role} · ${url}` },
    {
      id: 'embed',
      title: 'Embed card',
      hint: 'For your blog, portfolio or Notion.',
      text: `<iframe src="${url.replace(/\/?$/, '/')}card/" width="600" height="340" style="border:0;max-width:100%" loading="lazy" title="${name} on Starring"></iframe>`,
    },
  ];

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="share-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ed-modal-box ed-share">
        <p className="mono accent">You're live</p>
        <h3 className="display" id="share-title">Now showing</h3>
        <img className="ed-share-poster" src={poster} alt={`${name}'s poster — what people see when you share the link`} width={1200} height={630} />

        <div className="ed-share-link">
          <input className="ed-input" value={url} readOnly aria-label="Your stage's address" onFocus={(e) => e.currentTarget.select()} />
          <button type="button" className="ed-btn" onClick={() => copy('link', url)}>{copied === 'link' ? 'Copied ✓' : 'Copy link'}</button>
        </div>
        <div className="ed-share-row" role="group" aria-label="Share">
          {share.map((s) => (
            <a key={s.label} className="ed-btn ghost" href={s.href} target="_blank" rel="noreferrer">Share on {s.label} ↗</a>
          ))}
        </div>

        <h4 className="ed-sub">Make it stick</h4>
        <ol className="ed-share-steps">
          <li>
            <b>Feature it on LinkedIn.</b> On your profile: <i>Add profile section → Recommended → Add featured → Add a link</i>, paste your address. It shows up with your poster, right under your headline.{' '}
            <button type="button" className="ed-link" onClick={() => copy('featured', url)}>{copied === 'featured' ? 'Copied ✓' : 'Copy link'}</button>
          </li>
          <li>
            <b>Send it as a CV.</b> Job forms still want a PDF: your stage prints as a one-page CV that links back here.{' '}
            <a className="ed-link" href={`${url.replace(/\/?$/, '/')}cv/`} target="_blank" rel="noreferrer">Open the CV ↗</a>
          </li>
          {snippets.map((s) => (
            <li key={s.id}>
              <b>{s.title}.</b> {s.hint}
              <div className="ed-share-snippet">
                <code tabIndex={0} aria-label={`${s.title} snippet`}>{s.text}</code>
                <button type="button" className="ed-btn ghost" onClick={() => copy(s.id, s.text)} aria-label={`Copy ${s.title}`}>{copied === s.id ? 'Copied ✓' : 'Copy'}</button>
              </div>
            </li>
          ))}
        </ol>

        <div className="ed-modal-actions">
          <a className="ed-btn ghost" href={url} target="_blank" rel="noreferrer">Open my stage ↗</a>
          <span style={{ flex: 1 }} />
          <button type="button" className="ed-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
