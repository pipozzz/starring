import { useState } from 'react';
import type { Profile } from '../lib/model';
import { importGitlab, parseGitlab } from '../lib/importers/gitlab';

interface Props {
  current: Profile;
  onDone: (p: Profile, notes: string[], label: string) => void;
  onClose: () => void;
}

/** Start from a GitLab profile: gitlab.com or a self-hosted instance, optional token, fresh or merge. */
export default function GitlabDialog({ current, onDone, onClose }: Props) {
  const [instance, setInstance] = useState('https://gitlab.com');
  const [user, setUser] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [mode, setMode] = useState<'fresh' | 'merge'>('fresh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // a pasted profile URL names the instance too
  const where = parseGitlab(user, instance).instance;
  const tokenUrl = `${where}/-/user_settings/personal_access_tokens?name=Starring%20import&scopes=read_user`;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const { profile, notes } = await importGitlab(user, { instance, token, base: mode === 'merge' ? current : undefined });
      onDone(profile, notes, `Imported @${parseGitlab(user, instance).username} from GitLab`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-label="Import from GitLab" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="ed-modal-box" onSubmit={(e) => { e.preventDefault(); if (user.trim()) run(); }}>
        <p className="mono accent">Instant draft</p>
        <h3 className="display">Import from GitLab</h3>
        <p className="muted">We read your public profile, projects and activity on gitlab.com or your company’s GitLab and build a first draft. Nothing is saved anywhere but this browser.</p>

        <label className="ed-field">
          <span className="ed-label">GitLab address</span>
          <input className="ed-input" value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="https://gitlab.com" autoComplete="off" spellCheck={false} inputMode="url" />
          <span className="ed-hint">gitlab.com, or your self-hosted GitLab. Its admins must allow requests from other sites (GitLab does by default).</span>
        </label>

        <label className="ed-field">
          <span className="ed-label">Username or profile URL</span>
          <div className="ed-gh-input">
            <span className="mono muted">{where.replace(/^https?:\/\//, '')}/</span>
            <input className="ed-input" value={user} onChange={(e) => setUser(e.target.value)} placeholder="jane" autoFocus autoComplete="off" spellCheck={false} />
          </div>
        </label>

        {showToken ? (
          <label className="ed-field">
            <span className="ed-label">Token (optional)</span>
            <input className="ed-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="glpat-…" autoComplete="off" />
            <span className="ed-hint">
              Adds your bio, location, links and job title. Needs only <code>read_user</code>.{' '}
              <a href={tokenUrl} target="_blank" rel="noreferrer">Create one ↗</a> · Sent only to {where.replace(/^https?:\/\//, '')}, never stored.
            </span>
          </label>
        ) : (
          <button type="button" className="ed-link" onClick={() => setShowToken(true)}>+ Add a token for your bio, location and links</button>
        )}

        <div className="ed-seg" role="radiogroup" aria-label="Import mode">
          <label className={mode === 'fresh' ? 'on' : ''}>
            <input type="radio" name="gl-mode" checked={mode === 'fresh'} onChange={() => setMode('fresh')} />Start fresh
          </label>
          <label className={mode === 'merge' ? 'on' : ''}>
            <input type="radio" name="gl-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />Merge into current
          </label>
        </div>
        <p className="ed-hint">{mode === 'fresh' ? 'Replaces the current draft (you can undo).' : 'Keeps your GitHub work, clients, timeline, yearly numbers and NDA work; adds GitLab.'}</p>

        {error && <p className="ed-error" role="alert">{error}</p>}

        <div className="ed-modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="ed-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ed-btn" disabled={busy || !user.trim()}>{busy ? 'Importing…' : 'Build my draft'}</button>
        </div>
      </form>
    </div>
  );
}
