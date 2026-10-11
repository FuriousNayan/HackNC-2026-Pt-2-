'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { CONFIG, type Phase } from '@/contracts';
import { LjButton } from './LjButton';

export interface MessageBoxProps {
  phase: Phase | 'waiting';
  /** bumps on every server event, which re-arms the box after a send */
  eventCount: number;
  onSend: (text: string) => void | Promise<void>;
}

export function MessageBox({ phase, eventCount, onSend }: MessageBoxProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const answering = phase === 'cross';
  const max = answering ? CONFIG.limits.answerChars : CONFIG.limits.statementChars;

  // Re-arm when the server moves on, so a double tap can never send twice for one turn.
  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- reset the draft whenever the server moves the turn on
    setSending(false);
    setText('');
  }, [eventCount]);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await onSend(trimmed);
    } catch {
      setSending(false);
    }
  };

  return (
    <form
      className="message-box"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label htmlFor="court-message">{answering ? 'Answer the judge' : 'Your turn to speak'}</label>
      <textarea
        id="court-message"
        placeholder="Your turn to speak"
        maxLength={max}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={sending}
      />
      <div className="message-box-footer">
        <span className="mono">
          {text.length}/{max}
        </span>
        <LjButton type="submit" disabled={sending || !text.trim()}>
          {sending ? 'Sent' : 'Submit'} <Send />
        </LjButton>
      </div>
    </form>
  );
}
