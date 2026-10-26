// Server mode sync for the editor: who's signed in, autosave to /api/profile,
// claim a handle, publish. In static mode this hook is inert.
import { useCallback, useEffect, useRef, useState } from 'react';
import { validate, type Profile } from '../lib/model';

export const HOSTED = import.meta.env.STARRING_MODE === 'server';

export type SyncStatus =
  | 'off' // static mode
  | 'loading'
  | 'anon' // not signed in
  | 'unclaimed' // signed in, no handle yet
  | 'saved'
  | 'saving'
  | 'invalid' // local validation errors — not sent
  | 'error';

interface Me {
  user: { id: string; name: string; email: string; image?: string | null; githubLinked?: boolean } | null;
  profile: { handle: string; published: boolean; updatedAt: string; data: Profile } | null;
  features: { allowSignup: boolean; password: boolean; github: boolean; gitlab: boolean; /** 'anthropic' | 'openai' when the instance reads CVs with AI */ cvImport?: string | null; /** the instance stores uploads (STORAGE) */ uploads?: boolean };
}

const api = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status, issues: data.issues });
  return data as T;
};

export function useServer(p: Profile, onRemoteProfile: (p: Profile) => void, keepLocal: boolean) {
  const [status, setStatus] = useState<SyncStatus>(HOSTED ? 'loading' : 'off');
  const [me, setMe] = useState<Me | null>(null);
  const [own, setOwn] = useState<{ handle: string; published: boolean } | null>(null);
  const [error, setError] = useState('');
  const lastSent = useRef('');

  useEffect(() => {
    if (!HOSTED) return;
    api<Me>('GET', '/api/me')
      .then((m) => {
        setMe(m);
        if (!m.user) return setStatus('anon');
        if (!m.profile) return setStatus('unclaimed');
        setOwn({ handle: m.profile.handle, published: m.profile.published });
        if (keepLocal) {
          setStatus('saving'); // the imported/opened draft will be saved over the stored one
        } else {
          lastSent.current = JSON.stringify(m.profile.data);
          onRemoteProfile(m.profile.data);
          setStatus('saved');
        }
      })
      .catch(() => setStatus('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // debounced autosave once a handle is claimed
  useEffect(() => {
    if (!own) return;
    const body = JSON.stringify(p);
    if (body === lastSent.current) return;
    const issues = Object.keys(validate(p));
    if (issues.length) {
      setStatus('invalid');
      return;
    }
    setStatus('saving');
    const t = setTimeout(async () => {
      try {
        const saved = await api<{ handle: string; published: boolean }>('PUT', '/api/profile', { handle: p.handle, data: p });
        lastSent.current = body;
        setOwn({ handle: saved.handle, published: saved.published });
        setError('');
        setStatus('saved');
      } catch (e) {
        setError((e as Error).message);
        setStatus('error');
      }
    }, 900);
    return () => clearTimeout(t);
  }, [p, own?.handle]);

  const claim = useCallback(async (handleOverride?: string) => {
    const handle = handleOverride ?? p.handle;
    const data = { ...p, handle };
    try {
      const saved = await api<{ handle: string; published: boolean }>('PUT', '/api/profile', { handle, data });
      lastSent.current = JSON.stringify(data);
      setOwn({ handle: saved.handle, published: saved.published });
      setError('');
      setStatus('saved');
      return { ok: true as const, handle: saved.handle };
    } catch (e) {
      const err = e as Error & { issues?: Record<string, string> };
      setError(err.message);
      return { ok: false as const, error: err.message, issues: err.issues };
    }
  }, [p]);

  const publish = useCallback(async (published: boolean) => {
    try {
      const saved = await api<{ handle: string; published: boolean }>('PATCH', '/api/profile', { published });
      setOwn({ handle: saved.handle, published: saved.published });
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, []);

  return { hosted: HOSTED, status, me, own, error, claim, publish };
}
