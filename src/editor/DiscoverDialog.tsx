import { useEffect, useState } from 'react';
import type { Profile } from '../lib/model';
import type { Change, Suggestion } from '../lib/discover';

interface Props {
  draft: Profile;
  /** Puts suggestions into the draft, all in one undoable step. */
  onApply: (changes: Change[]) => void;
  onSection: (id: string) => void;
  onClose: () => void;
}

const SECTION: Record<Suggestion['section'], string> = { projects: 'Featured work', openSource: 'Guest appearances', contributions: 'Numbers' };

/** Autodiscovery: what GitHub knows that the stage doesn't say yet — add or dismiss each. */
export default function DiscoverDialog({ draft, onApply, onSection, onClose }: Props) {
  const [state, setState] = useState<{ loading: boolean; error?: string; login?: string; source?: string; items: Suggestion[] }>({ loading: true, items: [] });
  const [added, setAdded] = useState(0);

  useEffect(() => {
    let live = true;
    fetch('/api/discover', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ draft }) })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!live) return;
        if (!res.ok) setState({ loading: false, error: data.error || `Couldn’t check (${res.status})`, items: [] });
        else setState({ loading: false, login: data.login, source: data.source, items: data.suggestions });
      })
      .catch(() => live && setState({ loading: false, error: 'Couldn’t reach this Starring instance', items: [] }));
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => { live = false; removeEventListener('keydown', esc); };
    // the draft at the moment the dialog opened is what we compare with
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drop = (key: string) => setState((s) => ({ ...s, items: s.items.filter((x) => x.key !== key) }));
  const add = (list: Suggestion[]) => {
    onApply(list.map((s) => s.change));
    setAdded((n) => n + list.length);
    const keys = new Set(list.map((s) => s.key));
    setState((st) => ({ ...st, items: st.items.filter((x) => !keys.has(x.key)) }));
  };
  const dismiss = (s: Suggestion) => {
    drop(s.key);
    fetch('/api/discover', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dismiss: s.key }) }).catch(() => {});
  };
  const groups = (['projects', 'openSource', 'contributions'] as const).map((id) => ({ id, items: state.items.filter((x) => x.section === id) })).filter((g) => g.items.length);

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-labelledby="discover-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ed-modal-box ed-review">
        <p className="mono accent">Find updates</p>
        <h3 className="display" id="discover-title">
          {state.loading ? 'Asking GitHub…' : state.error ? 'Couldn’t check' : state.items.length ? `${state.items.length} new thing${state.items.length === 1 ? '' : 's'}` : added ? 'All caught up' : 'Nothing new'}
        </h3>
        <p className="muted">
          {state.loading
            ? 'Looking at your repos, organisations, pull requests and contributions.'
            : state.error
              ? state.error
              : <>From <a href={`https://github.com/${state.login}`} target="_blank" rel="noreferrer">github.com/{state.login}</a>{state.source === 'account' ? ' (your GitHub sign-in)' : ' (public data)'}. Anything you add goes into your draft — publish when you’re happy.</>}
        </p>
        {groups.length > 0 && (
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
          {added > 0 && <span className="mono accent">{added} added to your draft</span>}
          <span style={{ flex: 1 }} />
          {state.items.length > 1 && (
            <button type="button" className="ed-btn ghost" onClick={() => add(state.items)}>Add all</button>
          )}
          <button type="button" className="ed-btn" onClick={onClose}>{added ? 'Done' : 'Close'}</button>
        </div>
      </div>
    </div>
  );
}
