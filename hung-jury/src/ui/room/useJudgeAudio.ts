'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceStatus } from '../components/SubtitleBar';
import type { JudgeState } from './types';

/**
 * Plays audioUrl from judge events. If it is null, speaks the text with the browser's speech synthesis.
 * Browsers block audio until a click, so call unlock() from the join button. There is a mute toggle.
 * Subtitles are always on regardless of anything here.
 */
export function useJudgeAudio(judge: JudgeState | null, stopped: boolean) {
  const [unlocked, setUnlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAll = useCallback(() => {
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  const unlock = useCallback(() => {
    setUnlocked(true);
  }, []);

  useEffect(() => {
    if (!judge || stopped || muted || !unlocked) return;
    stopAll();
// eslint-disable-next-line react-hooks/set-state-in-effect -- a new judge line restarts playback
    setStatus('idle');

    if (judge.audioUrl) {
      const audio = new Audio(judge.audioUrl);
      audioRef.current = audio;
      setStatus('loading');
      audio.addEventListener('playing', () => setStatus('idle'));
      audio.play().catch(() => setStatus('failed'));
      return;
    }

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(judge.speech);
      utter.onerror = () => setStatus('failed');
      window.speechSynthesis.speak(utter);
    } else {
      setStatus('failed');
    }
    // judge.seq re-fires this effect for every new judge event
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [judge?.seq, stopped, muted, unlocked]);

  useEffect(() => {
    if (stopped || muted) stopAll();
  }, [stopped, muted, stopAll]);

  useEffect(() => stopAll, [stopAll]);

  return { unlocked, unlock, muted, setMuted, status };
}
