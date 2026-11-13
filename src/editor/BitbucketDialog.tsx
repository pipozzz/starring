import { useState } from 'react';
import type { Profile } from '../lib/model';
import { importBitbucket, parseBitbucket } from '../lib/importers/bitbucket';

interface Props {
  current: Profile;
  onDone: (p: Profile, notes: string[], label: string) => void;
  onClose: () => void;
}

/** Start from a Bitbucket workspace: public repos, or private ones too with a token; fresh or merge. */
export default function BitbucketDialog({ current, onDone, onClose }: Props) {
  const [workspace, setWorkspace] = useState('');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [mode, setMode] = useState<'fresh' | 'merge'>('fresh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const { profile, notes } = await importBitbucket(workspace, { email, token, base: mode === 'merge' ? current : undefined });
      onDone(profile, notes, `Imported ${parseBitbucket(workspace)} from Bitbucket`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-modal" role="dialog" aria-modal="true" aria-label="Import from Bitbucket" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form className="ed-modal-box" onSubmit={(e) => { e.preventDefault(); if (workspace.trim()) run(); }}>
        <p className="mono accent">Instant draft</p>
        <h3 className="display">Import from Bitbucket</h3>
        <p className="muted">We read a workspace’s repositories, their languages and your commits in them, and build a first draft. Nothing is saved anywhere but this browser.</p>

        <label className="ed-field">
          <span className="ed-label">Workspace or URL</span>
          <div className="ed-gh-input">
            <span className="mono muted">bitbucket.org/</span>
            <input className="ed-input" value={workspace} onChange={(e) => setWorkspace(e.target.value)} placeholder="your-workspace" autoFocus autoComplete="off" spellCheck={false} />
          </div>
          <span className="ed-hint">Your personal workspace, or your agency’s.</span>
        </label>

        {showToken ? (
          <>
            <label className="ed-field">
              <span className="ed-label">Atlassian email</span>
              <input className="ed-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="off" />
              <span className="ed-hint">Leave empty for a workspace or repository access token.</span>
            </label>
            <label className="ed-field">
              <span className="ed-label">API token (optional)</span>
              <input className="ed-input" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
              <span className="ed-hint">
                Adds private repositories (shown as private work, never linked) and counts exactly your commits. Read-only repository access is enough.{' '}
                <a href="https://id.atlassian.com/manage-profile/security/api-tokens" target="_blank" rel="noreferrer">Create one ↗</a> · Sent only to Bitbucket, never stored.
              </span>
            </label>
          </>
        ) : (
          <button type="button" className="ed-link" onClick={() => setShowToken(true)}>+ Add a token for private repositories</button>
        )}

        <div className="ed-seg" role="radiogroup" aria-label="Import mode">
          <label className={mode === 'fresh' ? 'on' : ''}>
            <input type="radio" name="bb-mode" checked={mode === 'fresh'} onChange={() => setMode('fresh')} />Start fresh
          </label>
          <label className={mode === 'merge' ? 'on' : ''}>
            <input type="radio" name="bb-mode" checked={mode === 'merge'} onChange={() => setMode('merge')} />Merge into current
          </label>
        </div>
        <p className="ed-hint">{mode === 'fresh' ? 'Replaces the current draft (you can undo).' : 'Keeps your GitHub and GitLab work, clients, timeline, yearly numbers and NDA work; adds Bitbucket.'}</p>

        {error && <p className="ed-error" role="alert">{error}</p>}

        <div className="ed-modal-actions">
          <span style={{ flex: 1 }} />
          <button type="button" className="ed-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="ed-btn" disabled={busy || !workspace.trim()}>{busy ? 'Importing…' : 'Build my draft'}</button>
        </div>
      </form>
    </div>
  );
}
