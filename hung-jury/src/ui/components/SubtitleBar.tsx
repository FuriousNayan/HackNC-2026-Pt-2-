'use client';

import type { Message } from '@/contracts';
import type { JudgeState } from '../room/types';

export type VoiceStatus = 'idle' | 'loading' | 'failed';

export interface SubtitleBarProps {
  judge: JudgeState | null;
  message: Message | null;
  voiceStatus?: VoiceStatus;
}

/** Subtitles are always on, even when audio plays. */
export function SubtitleBar({ judge, message, voiceStatus = 'idle' }: SubtitleBarProps) {
  return (
    <section className="parchment subtitle-bar" aria-live="polite" role="status">
      <div className="subtitle-label mono">
        THE JUDGE
        {voiceStatus !== 'idle' ? (
          <span>{voiceStatus === 'loading' ? '(voice loading)' : '(voice unavailable, subtitles only)'}</span>
        ) : null}
      </div>
      <p className="judge-speech">“{judge?.speech ?? 'The court will come to order shortly.'}”</p>
      {message ? (
        <p className="latest-message">
          <strong>
            {message.role} {message.authorHandle}:
          </strong>{' '}
          {message.text}
        </p>
      ) : null}
    </section>
  );
}
