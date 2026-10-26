import { useRef, useState } from 'react';
import { Text } from './fields';

/** Width × height of the stored portrait (4:5, like a poster). */
export const PHOTO_W = 800;
export const PHOTO_H = 1000;

/**
 * Any image → a 4:5 JPEG, centred, upright (EXIF orientation applied), at most 800×1000.
 * Drawing through a canvas also drops every bit of metadata — GPS, camera, date.
 */
export async function portraitJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const target = PHOTO_W / PHOTO_H;
  const srcRatio = bmp.width / bmp.height;
  const sw = srcRatio > target ? bmp.height * target : bmp.width;
  const sh = srcRatio > target ? bmp.height : bmp.width / target;
  const scale = Math.min(1, PHOTO_W / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
  bmp.close();
  return new Promise((ok, no) => canvas.toBlob((b) => (b ? ok(b) : no(new Error('Couldn’t read that image'))), 'image/jpeg', 0.88));
}

interface Props {
  value?: string;
  onChange: (url: string | undefined) => void;
  /** The instance stores uploads and someone is signed in. */
  canUpload: boolean;
  error?: string;
  notify: (msg: string) => void;
}

export default function PhotoField({ value, onChange, canUpload, error, notify }: Props) {
  const picker = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const upload = async (file: File) => {
    setBusy(true);
    setProblem('');
    try {
      if (!file.type.startsWith('image/')) throw new Error('Choose a photo (JPEG, PNG, WebP or HEIC)');
      const blob = await portraitJpeg(file);
      const form = new FormData();
      form.append('file', new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
      const res = await fetch('/api/upload/photo', { method: 'POST', body: form, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
      onChange(data.url);
      notify('Photo added — it shows in your hero, your poster and your trailer');
    } catch (e) {
      setProblem((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ed-photo wide">
      <span className="ed-label">Photo</span>
      <div className="ed-photo-row">
        <div className="ed-photo-frame" aria-hidden={!value}>
          {value ? <img src={value} alt="Your photo" width={80} height={100} /> : <span>No photo</span>}
        </div>
        <div className="ed-photo-actions">
          {canUpload && (
            <>
              <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload(f); }} />
              <button type="button" className="ed-btn ghost" onClick={() => picker.current?.click()} disabled={busy}>
                {busy ? 'Uploading…' : value ? 'Replace photo' : 'Upload a photo'}
              </button>
            </>
          )}
          {value && <button type="button" className="ed-link" onClick={() => onChange(undefined)} disabled={busy}>Remove</button>}
          <span className="ed-hint">
            {canUpload ? 'Cropped to a 4:5 portrait in your browser; location and camera data are removed.' : 'Optional. A portrait works best.'}
          </span>
        </div>
      </div>
      {!canUpload && (
        <Text label="Image address" value={value} onChange={(v) => onChange(v.trim() || undefined)} placeholder="https://…/me.jpg" error={error} wide />
      )}
      {canUpload && error && <span className="ed-error">{error}</span>}
      {problem && <span className="ed-error" role="alert">{problem}</span>}
    </div>
  );
}
