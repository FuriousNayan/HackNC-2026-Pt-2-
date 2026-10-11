'use client';

import { useState } from 'react';
import { CONFIG } from '@/contracts';
import { ArrowRight, LockIcon } from './Icons';

export interface FileCaseValues {
  title: string;
  grievance: string;
  defendantHandle: string;
  sentenceRequest?: string;
}

export interface FileCaseCardProps {
  onSubmit: (values: FileCaseValues) => void | Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function FileCaseCard({ onSubmit, busy = false, error = null }: FileCaseCardProps) {
  const [title, setTitle] = useState('');
  const [grievance, setGrievance] = useState('');
  const [handle, setHandle] = useState('');
  const [sentence, setSentence] = useState('');

  const max = CONFIG.limits.grievanceChars;
  const ready = title.trim() !== '' && grievance.trim() !== '' && handle.trim() !== '';

  const submit = () => {
    if (!ready || busy) return;
    void onSubmit({
      title: title.trim(),
      grievance: grievance.trim(),
      defendantHandle: handle.trim().replace(/^@/, '').toLowerCase(),
      sentenceRequest: sentence.trim() || undefined,
    });
  };

  return (
    <section className="hj-card hj-file" aria-label="File a case">
      <div className="hj-eyebrow">Small claims, big feelings</div>
      <h2>File a case</h2>
      <p className="sub">Let&apos;s get this off your chest. And on the record.</p>

      <label className="hj-field">
        <span className="hj-label">Case title</span>
        <input
          className="hj-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="The Case of the Missing Oat Milk"
        />
      </label>

      <label className="hj-field" style={{ marginBottom: 0 }}>
        <span className="hj-label">What happened?</span>
        <textarea
          className="hj-textarea"
          value={grievance}
          maxLength={max}
          onChange={(e) => setGrievance(e.target.value)}
          placeholder="Tell the court your side of the story..."
        />
        <div className="hj-count">
          {grievance.length}/{max}
        </div>
      </label>

      <div className="hj-two" style={{ marginTop: 20 }}>
        <label className="hj-field">
          <span className="hj-label">Who is being named?</span>
          <span className="hj-prefix">
            <span className="at">@</span>
            <input
              className="hj-input"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="maya"
              autoComplete="off"
              autoCapitalize="none"
            />
          </span>
        </label>
        <label className="hj-field">
          <span className="hj-label">
            Sentence request <small>(optional)</small>
          </span>
          <input
            className="hj-input"
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            placeholder="dish duty"
          />
        </label>
      </div>

      <p className="hj-note">
        <LockIcon size={15} />
        <span>
          Phone numbers, emails, addresses and links are removed automatically. Only the named
          defendant sees this until they accept.
        </span>
      </p>

      {error ? (
        <p className="hj-error" role="alert">
          {error}
        </p>
      ) : null}

      <button className="hj-submit" disabled={!ready || busy} onClick={submit}>
        {busy ? 'Sending...' : 'Summon defendant'}
        {busy ? null : <ArrowRight size={16} />}
      </button>
    </section>
  );
}
