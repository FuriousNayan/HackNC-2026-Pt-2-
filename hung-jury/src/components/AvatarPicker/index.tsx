'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { MEDIA_CONFIG, TOKENS, type AvatarKind, type AvatarPickerProps } from '../../contracts';
import { PRESET_AVATARS } from '../../media/presets';
import { cropHead } from '../../media/crop';
import { Bobblehead } from '../../ui/components/Bobblehead';
import './styles.css';
export function AvatarPicker({ defaultKind = 'avatar', onDone }: AvatarPickerProps) {
  const [kind, setKind] = useState<AvatarKind>(defaultKind),
    [preview, setPreview] = useState(PRESET_AVATARS[0].headImageUrl),
    [crop, setCrop] = useState<Blob | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [camera, setCamera] = useState(false);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    objectUrl = useRef<string | null>(null),
    alive = useRef(true),
    generation = useRef(0);
  function stopCamera() {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setCamera(false);
  }
  function clearPhoto() {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
    setCrop(null);
    setPreview(PRESET_AVATARS[0].headImageUrl);
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      stream.current?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = null;
    };
  }, []);
  useEffect(() => {
    if (camera && video.current && stream.current) {
      const currentStream = stream.current;
      video.current.srcObject = currentStream;
      void video.current.play().catch(() => {
        if (alive.current && stream.current === currentStream) {
          stopCamera();
          setError('Camera preview could not start. Choose a preset or upload a picture.');
        }
      });
    }
  }, [camera]);
  function tab(next: AvatarKind) {
    generation.current++;
    stopCamera();
    clearPhoto();
    setKind(next);
    setError('');
  }
  async function prepare(file: Blob, ticket = ++generation.current) {
    setBusy(true);
    setError('');
    clearPhoto();
    try {
      const head = await cropHead(file);
      if (!alive.current || ticket !== generation.current) return;
      if (!head) throw new Error('No face found. Try another photo.');
      objectUrl.current = URL.createObjectURL(head);
      setCrop(head);
      setPreview(objectUrl.current);
    } catch (e) {
      if (alive.current && ticket === generation.current)
        setError(e instanceof Error ? e.message : 'Unable to crop photo.');
    } finally {
      if (alive.current && ticket === generation.current) setBusy(false);
    }
  }
  async function startCamera() {
    const ticket = ++generation.current;
    stopCamera();
    clearPhoto();
    setBusy(true);
    setError('');
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      if (!alive.current || ticket !== generation.current) {
        media.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = media;
      setCamera(true);
    } catch {
      if (alive.current && ticket === generation.current)
        setError('Camera permission denied or unavailable. Choose a preset or upload a picture.');
    } finally {
      if (alive.current && ticket === generation.current) setBusy(false);
    }
  }
  async function capture() {
    const v = video.current;
    if (!v?.videoWidth) {
      setError('Wait for the camera preview.');
      return;
    }
    const ticket = ++generation.current;
    setBusy(true);
    clearPhoto();
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error('Camera capture is unavailable. Choose a preset or upload a picture.');
      context.drawImage(v, 0, 0);
      stopCamera();
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.9),
      );
      if (!alive.current || ticket !== generation.current) return;
      if (!blob) throw new Error('Camera capture failed. Please try again.');
      await prepare(blob, ticket);
    } catch (e) {
      if (alive.current && ticket === generation.current)
        setError(e instanceof Error ? e.message : 'Camera capture failed.');
    } finally {
      if (alive.current && ticket === generation.current) {
        stopCamera();
        setBusy(false);
      }
    }
  }
  async function done() {
    if (busy || camera) return;
    stopCamera();
    if (kind === 'avatar') {
      onDone({ kind, headImageUrl: preview });
      return;
    }
    if (!crop) return;
    const ticket = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('file', crop, 'head.png');
      const response = await fetch(MEDIA_CONFIG.routes.avatar, {
        method: 'POST',
        body: form,
        credentials: 'same-origin',
      });
      const result = await response.json();
      if (!response.ok || result.error)
        throw new Error(
          result.error === 'unsafe'
            ? 'This photo cannot be used. Choose a preset or another photo.'
            : result.error === 'no_face'
              ? 'No face found in the crop.'
              : response.status === 503
                ? 'Photo upload is not available right now. Choose a preset bobblehead instead.'
                : result.error || 'Upload failed',
        );
      if (typeof result.headImageUrl !== 'string' || !result.headImageUrl.trim())
        throw new Error('Upload did not return a head image.');
      if (alive.current && ticket === generation.current)
        onDone({ kind, headImageUrl: result.headImageUrl });
    } catch (e) {
      if (alive.current && ticket === generation.current)
        setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      if (alive.current && ticket === generation.current) setBusy(false);
    }
  }
  return (
    <section
      className="avatar-picker parchment"
      style={
        {
          '--avatar-brass': TOKENS.brass500,
          '--avatar-paper': TOKENS.parchment100,
          '--avatar-ink': TOKENS.ink900,
          '--avatar-wood': TOKENS.wood700,
        } as CSSProperties
      }
      aria-label="Choose your bobblehead"
    >
      <div className="tabs" role="group" aria-label="Avatar source">
        {(['avatar', 'photo', 'webcam'] as const).map((k) => (
          <button
            type="button"
            key={k}
            className="tab"
            disabled={busy}
            aria-pressed={kind === k}
            onClick={() => tab(k)}
          >
            {k === 'photo' ? 'Picture' : k === 'webcam' ? 'Webcam' : 'Presets'}
          </button>
        ))}
      </div>
      {kind !== 'avatar' && <p>{MEDIA_CONFIG.privacyNotice}</p>}
      {kind === 'avatar' ? (
        <div className="avatar-grid">
          {PRESET_AVATARS.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-label={p.label}
              aria-pressed={preview === p.headImageUrl}
              onClick={() => setPreview(p.headImageUrl)}
            >
              <img src={p.headImageUrl} alt="" />
            </button>
          ))}
        </div>
      ) : kind === 'photo' ? (
        <label>
          Choose picture
          <input
            disabled={busy}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void prepare(file);
              e.target.value = '';
            }}
          />
        </label>
      ) : (
        <div>
          {camera ? (
            <>
              <video ref={video} muted playsInline aria-label="Camera preview" />
              <div className="camera-actions">
                <button type="button" className="pill-btn" onClick={() => void capture()}>
                  Capture
                </button>
                <button type="button" className="pill-btn" onClick={stopCamera}>
                  Cancel camera
                </button>
              </div>
            </>
          ) : (
            <button type="button" className="pill-btn" disabled={busy} onClick={() => void startCamera()}>
              {crop ? 'Retake' : 'Start camera'}
            </button>
          )}
        </div>
      )}
      <div className="avatar-stage">
        <Bobblehead role="juror" headImageUrl={preview} speaking size="lg" label="Your bobblehead preview" />
      </div>
      <p role="status">{busy ? 'Processing…' : ''}</p>
      {error && <p role="alert">{error}</p>}
      <button
        type="button"
        className="use-button"
        disabled={busy || camera || (kind !== 'avatar' && !crop)}
        onClick={() => void done()}
      >
        Use this avatar
      </button>
    </section>
  );
}
export default AvatarPicker;
