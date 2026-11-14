import { useEffect, useState } from 'react';
import type { Profile } from '../lib/model';
import { discover, type Change, type Suggestion } from '../lib/discover';

/** The latest GitHub check, as GET/POST /api/discover return it. */
export interface Check {
  login: string;
  source: string;
  found: Profile | null;
  checkedAt: string;
  error: string | null;
  dismissed: string[];
}

interface Props {
  draft: Profile;
  check: Check | null;
  /** A new check came back, or a suggestion was dismissed. */
  onCheck: (check: Check) => void;
  /** Puts suggestions into the draft, all in one undoable step. */
  onApply: (changes: Change[]) => void;
  onSection: (id: string) => void;
  onClose: () => void;
}

const SECTION: Record<Suggestion['section'], string> = { projects: 'Featured work', openSource: 'Guest appearances', contributions: 'Numbers' };

const ago = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days < 1 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};

/** Find updates on GitHub to add to the stage — the weekly check's, or a fresh one; add or dismiss each. */
export default function DiscoverDialog({ draft, check, onCheck, onApply, onSection, onClose }: Props) {
  const [loading, setLoading] = useState(!check?.found);
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState(0);

  const run = () => {
    setLoading(true);
    setError(undefined);
    fetch('/api/discover', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft }) })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (res.ok) onCheck(data.check);
        else setError(data.error || `Couldn’t check (${res.status})`);
      })
      .catch(() => setError('Couldn’t reach this Starring instance'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // never checked (or the weekly check had nothing to read): ask GitHub now
    if (!check?.found) run();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // worked out against the draft as it is now, so added ones drop out by themselves
  const items = check?.found ? discover(draft, check.found, new Set(check.dismissed)) : [];
  const add = (list: Suggestion[]) => {
    onApply(list.map((s) => s.change));
    setAdded((n) => n + list.length);
  };
  const dismiss = (s: Suggestion) => {
    if (check) onCheck({ ...check, dismissed: [...check.dismissed, s.key] });
    fetch('/api/discover', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dismiss: s.key }) }).catch(() => {});
  };
  const groups = (['projects', 'openSource', 'contributions'] as const).map((id) => ({ id, items: items.filter((x) => x.section === id) })).filter((g) => g.items.length);
  const shown = loading ? null : error ? 'error' : 'done';

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="discover-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ed-modal-box ed-review">
        <p className="mono accent">Find updates</p>
        <h3 className="display" id="discover-title">
          {!shown ? 'Asking GitHub…' : shown === 'error' ? 'Couldn’t check' : items.length ? `${items.length} new thing${items.length === 1 ? '' : 's'}` : added ? 'All caught up' : 'Nothing new'}
        </h3>
        <p className="muted">
          {!shown
            ? 'Looking at your repos, organisations, pull requests and contributions.'
            : shown === 'error'
              ? error
              : check && <>From <a href={`https://github.com/${check.login}`} target="_blank" rel="noreferrer">github.com/{check.login}</a>{check.source === 'account' ? ' (your GitHub sign-in)' : ' (public data)'}, checked {ago(check.checkedAt)}. Anything you add goes into your draft — publish when you’re happy.</>}
        </p>
        {shown === 'done' && groups.length > 0 && (
          <div className="ed-review-list">
            {groups.map((g) => (
              <section key={g.id}>
                <button type="button" className="ed-review-h mono" onClick={() => { onSection(g.id); onClose(); }}>{SECTION[g.id]} <span aria-hidden="true">→</span></button>
                <ul className="ed-discover">
                  {g.items.map((s) => (
                    <li key={s.key}>
                      <span>
                        <b>{s.title}</b>
                        {s.detail && <span className="muted">{s.detail}</span>}
                      </span>
                      <span className="ed-discover-actions">
                        <button type="button" className="ed-btn ghost" onClick={() => dismiss(s)} aria-label={`Dismiss: ${s.title}`}>Dismiss</button>
                        <button type="button" className="ed-btn" onClick={() => add([s])} aria-label={`Add: ${s.title}`}>Add</button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
        <div className="ed-modal-actions">
          {added > 0 ? <span className="mono accent">{added} added to your draft</span> : shown && <button type="button" className="ed-btn ghost" onClick={run}>Check again</button>}
          <span style={{ flex: 1 }} />
          {shown === 'done' && items.length > 1 && (
            <button type="button" className="ed-btn ghost" onClick={() => add(items)}>Add all</button>
          )}
          <button type="button" className="ed-btn" onClick={onClose}>{added ? 'Done' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}
