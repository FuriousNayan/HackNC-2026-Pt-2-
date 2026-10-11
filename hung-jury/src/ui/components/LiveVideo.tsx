'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from 'livekit-client';
import { LjButton } from './LjButton';

/** Optional live video, arguers only. Off unless NEXT_PUBLIC_HJ_VIDEO=livekit (match HJ_VIDEO on the server). */
export const VIDEO_ON = process.env.NEXT_PUBLIC_HJ_VIDEO === 'livekit';

type Phase = 'off' | 'connecting' | 'on' | 'error';

interface Props {
  caseId: string;
  /** false once the case is closed or safety closed: the camera is cut immediately. */
  active: boolean;
  otherHandle: string;
}

export function LiveVideo({ caseId, active, otherHandle }: Props) {
  const [phase, setPhase] = useState<Phase>('off');
  const [message, setMessage] = useState('');
  const [remoteHere, setRemoteHere] = useState(false);
  const room = useRef<Room | null>(null);
  const localEl = useRef<HTMLVideoElement>(null);
  const remoteEl = useRef<HTMLVideoElement>(null);

  // Disconnects without touching state, so effects can call it.
  const hangUp = useCallback(async () => {
    const r = room.current;
    room.current = null;
    try {
      await r?.disconnect();
    } catch {
      // already gone
    }
  }, []);

  const stop = useCallback(async () => {
    await hangUp();
    setRemoteHere(false);
    setPhase('off');
  }, [hangUp]);

  // Cut the camera the moment the case ends or the page goes away.
  useEffect(() => {
    if (!active) void hangUp();
  }, [active, hangUp]);
  useEffect(() => () => void hangUp(), [hangUp]);
  const shown: Phase = active ? phase : 'off';

  const start = async () => {
    setPhase('connecting');
    setMessage('');
    try {
      const res = await fetch(`/api/cases/${caseId}/video`, { method: 'POST', headers: { 'content-type': 'application/json' } });
      if (!res.ok) throw new Error(res.status === 404 ? 'Video is not turned on.' : res.status === 409 ? 'Video starts once court is in session.' : 'Video is unavailable right now.');
      const { url, token } = (await res.json()) as { url: string; token: string };
      const { Room, RoomEvent, Track } = await import('livekit-client');
      const r = new Room({ adaptiveStream: true });
      r.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Video && remoteEl.current) {
          track.attach(remoteEl.current);
          setRemoteHere(true);
        }
      });
      r.on(RoomEvent.TrackUnsubscribed, (track) => {
        if (track.kind === Track.Kind.Video) {
          track.detach();
          setRemoteHere(false);
        }
      });
      r.on(RoomEvent.Disconnected, () => {
        if (room.current === r) void stop();
      });
      try {
        await r.connect(url, token);
      } catch {
        throw new Error('Could not reach the video service. Check your connection and try again.');
      }
      room.current = r;
      // Camera only. No microphone, so nothing talks over the judge.
      try {
        await r.localParticipant.setCameraEnabled(true);
      } catch {
        throw new Error('The browser blocked your camera. Allow camera access for this site and try again.');
      }
      const pub = [...r.localParticipant.videoTrackPublications.values()][0];
      if (pub?.track && localEl.current) pub.track.attach(localEl.current);
      setPhase('on');
    } catch (e) {
      await stop();
      setPhase('error');
      setMessage(e instanceof Error && e.message ? e.message : 'Could not start your camera.');
    }
  };

  return (
    <section className="parchment live-video" aria-label="Live video">
      <div className="live-video-head">
        <strong>Live video (optional)</strong>
        <span>Only you and @{otherHandle} can see it. The jury sees bobbleheads. No sound.</span>
      </div>
      <div className="live-video-tiles" hidden={shown !== 'on'}>
        <div>
          <video ref={localEl} autoPlay playsInline muted />
          <small>You</small>
        </div>
        <div>
          <video ref={remoteEl} autoPlay playsInline muted />
          <small>{remoteHere ? `@${otherHandle}` : `Waiting for @${otherHandle}'s camera`}</small>
        </div>
      </div>
      <div className="row-actions">
        {shown === 'on' ? (
          <LjButton variant="outline" onClick={() => void stop()}>
            Turn my camera off
          </LjButton>
        ) : (
          <LjButton variant="outline" disabled={shown === 'connecting' || !active} onClick={() => void start()}>
            {shown === 'connecting' ? 'Starting...' : 'Turn on my camera'}
          </LjButton>
        )}
      </div>
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
