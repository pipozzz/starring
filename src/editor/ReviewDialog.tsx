import { useEffect, useState } from 'react';
import type { ChangeGroup } from '../lib/diff';

interface Props {
  groups: ChangeGroup[];
  /** The public page. */
  url: string;
  onPublish: () => Promise<void>;
  onDiscard: () => Promise<void>;
  /** Jump to a section of the editor. */
  onSection: (id: string) => void;
  onClose: () => void;
}

/** Before publishing: what's about to change on the public stage, section by section. */
export default function ReviewDialog({ groups, url, onPublish, onDiscard, onSection, onClose }: Props) {
  const [busy, setBusy] = useState<'publish' | 'discard' | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const count = groups.reduce((s, g) => s + g.items.length, 0);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
      // ⌘↵ / Ctrl+↵ publishes from the dialog
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && count && !busy) { e.preventDefault(); run('publish'); }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const run = async (what: 'publish' | 'discard') => {
    setBusy(what);
    try {
      await (what === 'publish' ? onPublish() : onDiscard());
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="review-title" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="ed-modal-box ed-review">
        <p className="mono accent">Review</p>
        <h3 className="display" id="review-title">{count ? `${count} change${count === 1 ? '' : 's'}` : 'Nothing new'}</h3>
        <p className="muted">
          {count
            ? 'Your stage still shows the live version. Publish to put these on it — or throw them away and go back to what’s live.'
            : 'Your draft is the same as the live stage.'}
        </p>
        {count > 0 && (
          <div className="ed-review-list">
            {groups.map((g) => (
              <section key={g.id}>
                <button type="button" className="ed-review-h mono" onClick={() => { onSection(g.id); onClose(); }} title="Open this section">
                  {g.section} <span aria-hidden="true">→</span>
                </button>
                <ul>{g.items.map((item, i) => <li key={i}>{item}</li>)}</ul>
              </section>
            ))}
          </div>
        )}
        <div className="ed-modal-actions">
          <a className="ed-btn ghost" href={url} target="_blank" rel="noreferrer">View live ↗</a>
          <span style={{ flex: 1 }} />
          {count > 0 && (confirmDiscard ? (
            <button type="button" className="ed-btn ghost danger" onClick={() => run('discard')} disabled={!!busy}>
              {busy === 'discard' ? 'Discarding…' : `Yes, discard ${count}`}
            </button>
          ) : (
            <button type="button" className="ed-btn ghost" onClick={() => setConfirmDiscard(true)} disabled={!!busy}>Discard changes</button>
          ))}
          <button type="button" className="ed-btn ghost" onClick={onClose} disabled={!!busy}>Cancel</button>
          {count > 0 && (
            <button type="button" className="ed-btn" onClick={() => run('publish')} disabled={!!busy} title="⌘↵">
              {busy === 'publish' ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
