'use client';
import Link from 'next/link';import { useState } from 'react';
import {
  CONFIG,
  JUDGE_CONFIG as C,
  toneBand,
  type JudgeInput,
  type JudgeOutput,
  type Phase,
} from '@/contracts';
import { FIXTURES, FIXTURE_LABELS } from '@/judge/fixtures';
interface Result {
  output: JudgeOutput;
  source: string;
  attempts: number;
  elapsedMs: number;
  reason?: string;
}
const phaseLabels: Record<Phase, string> = {
  opening: 'Opening',
  statements: 'Statements',
  cross: 'Cross-examination',
  rebuttal: 'Rebuttal',
  closing: 'Closing',
  verdict: 'Verdict',
};
function Gavel() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="m24 15 16 16M19 20l16 16M23 12l20 20M16 19l20 20M32 32l18 18M12 51h25M9 56h32"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path d="m16 19 7-7M36 39l7-7" stroke="currentColor" strokeWidth="5" />
    </svg>
  );
}
export default function JudgeBench({
  liveConfigured,
  defaultDemo,
  development,
}: {
  liveConfigured: boolean;
  defaultDemo: boolean;
  development: boolean;
}) {
  const [scenario, setScenario] = useState('oat-milk');
  const [phase, setPhase] = useState<Phase>('cross');
  const [dial, setDial] = useState<number>(CONFIG.tone.start);
  const [target, setTarget] = useState<'plaintiff' | 'defendant'>('defendant');
  const [reaction, setReaction] = useState(false);
  const [mode, setMode] = useState<'demo' | 'live'>(defaultDemo ? 'demo' : 'live');
  const [grievance, setGrievance] = useState(FIXTURES['oat-milk'].grievance);
  const [editText, setEditText] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const band = toneBand(dial);
  const fixture = FIXTURES[scenario];
  const transcript =
    phase === 'opening'
      ? []
      : phase === 'statements' || (phase === 'cross' && !reaction)
        ? fixture.transcript.slice(0, 2)
        : fixture.transcript;
  const input: JudgeInput = {
    ...fixture,
    grievance,
    phase,
    toneDial: dial,
    target: phase === 'cross' ? target : undefined,
    turnKind: phase === 'cross' && reaction ? 'reaction' : undefined,
    transcript: transcript.map((m, i) =>
      i === transcript.length - 1 && editText !== null ? { ...m, text: editText } : m,
    ),
  };
  function reset() {
    setResult(null);
    setError('');
  }
  async function run() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const response = await fetch(C.devEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input, mode }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.issues?.length
            ? data.error +
                ': ' +
                data.issues
                  .map((i: { path: string; message: string }) => `${i.path}: ${i.message}`)
                  .join('; ')
            : (data.error ?? 'The judge could not be reached.'),
        );
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The judge could not be reached.');
    } finally {
      setBusy(false);
    }
  }
  function save() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result.output, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${scenario}-${phase}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" href="/">
          <span className="brand-icon">
            <Gavel />
          </span>
          <span>
            HUNG JURY<span className="brand-sub">A COURT FOR THE LITTLE THINGS</span>
          </span>
        </Link>
        <span className="workspace-tag">
          <span className="status-dot" />
          PART 03 / JUDGE’S BENCH
        </span>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">THE HONORABLE HOLLIS GAVEL PRESIDING</p>
            <h1>
              Small disputes.
              <br />
              <em>Considerable drama.</em>
            </h1>
            <p className="intro-copy">
              Give the judge a case. Set the mood. See what the court has to say.
            </p>
          </div>
          <div className="seal">
            <Gavel />
            <span>
              ORDER IN
              <br />
              THE COURT
            </span>
            <small>EST. 2026</small>
          </div>
        </div>
        {!development && (
          <div className="notice">
            This testing bench runs locally with <code>npm run dev</code>. Production judge calls
            belong in your teammate’s authenticated backend.
          </div>
        )}
        <div className="bench-grid">
          <section className="case-panel" aria-labelledby="case-heading">
            <div className="panel-heading">
              <span className="step-number">01</span>
              <h2 id="case-heading">Prepare the case</h2>
              <span className="small-caps">CASE FILE</span>
            </div>
            <div className="form-body">
              <fieldset disabled={busy}>
                <label htmlFor="scenario">Choose a case</label>
                <select
                  id="scenario"
                  value={scenario}
                  onChange={(e) => {
                    setScenario(e.target.value);
                    setGrievance(FIXTURES[e.target.value].grievance);
                    setEditText(null);
                    reset();
                  }}
                >
                  {Object.entries(FIXTURE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <div className="parties">
                  <span>
                    <small>PLAINTIFF</small>
                    {fixture.parties?.plaintiff}
                  </span>
                  <b>v.</b>
                  <span>
                    <small>DEFENDANT</small>
                    {fixture.parties?.defendant}
                  </span>
                </div>
                <label htmlFor="grievance">
                  The grievance{' '}
                  <span className="field-count">
                    {grievance.length}/{CONFIG.limits.grievanceChars}
                  </span>
                </label>
                <textarea
                  id="grievance"
                  rows={3}
                  maxLength={CONFIG.limits.grievanceChars}
                  value={grievance}
                  onChange={(e) => {
                    setGrievance(e.target.value);
                    reset();
                  }}
                />
                <div className="field-row">
                  <div>
                    <label htmlFor="phase">Trial phase</label>
                    <select
                      id="phase"
                      value={phase}
                      onChange={(e) => {
                        setPhase(e.target.value as Phase);
                        setEditText(null);
                        reset();
                      }}
                    >
                      {C.phases.map((p) => (
                        <option value={p} key={p}>
                          {phaseLabels[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="mode">Judge mode</label>
                    <select
                      id="mode"
                      value={mode}
                      onChange={(e) => {
                        setMode(e.target.value as 'demo' | 'live');
                        reset();
                      }}
                    >
                      <option value="demo">Scripted demo</option>
                      <option value="live">Live Gemini</option>
                    </select>
                  </div>
                </div>
                {phase === 'cross' && (
                  <div className="cross-options">
                    <label htmlFor="target">Question for</label>
                    <select
                      id="target"
                      value={target}
                      onChange={(e) => {
                        setTarget(e.target.value as typeof target);
                        reset();
                      }}
                    >
                      <option value="plaintiff">Plaintiff · Dave</option>
                      <option value="defendant">Defendant · Maya</option>
                    </select>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={reaction}
                        onChange={(e) => {
                          setReaction(e.target.checked);
                          setEditText(null);
                          reset();
                        }}
                      />
                      React to an answer instead of asking
                    </label>
                  </div>
                )}
                <div className="tone-control">
                  <div className="tone-heading">
                    <label htmlFor="dial">The court’s mood</label>
                    <span className="dial-number">{dial.toFixed(2)}</span>
                  </div>
                  <input
                    id="dial"
                    type="range"
                    min={CONFIG.tone.floor}
                    max={CONFIG.tone.ceiling}
                    step="0.01"
                    value={dial}
                    onChange={(e) => {
                      setDial(Number(e.target.value));
                      reset();
                    }}
                  />
                  <div className="tone-labels">
                    <span>Measured</span>
                    <strong>{band.replaceAll('_', ' ')}</strong>
                    <span>Absurd</span>
                  </div>
                  <div className="dial-presets">
                    {[0.4, 0.55, 0.9].map((n) => (
                      <button
                        type="button"
                        key={n}
                        onClick={() => {
                          setDial(n);
                          reset();
                        }}
                      >
                        {n === 0.4 ? 'Serious' : n === 0.55 ? 'Theatrical' : 'Full chaos'}
                      </button>
                    ))}
                  </div>
                </div>
                <details className="testimony">
                  <summary>
                    Testimony in the record <span>{input.transcript.length} messages</span>
                  </summary>
                  {input.transcript.map((m) => (
                    <div className="message" key={m.id}>
                      <strong>
                        {m.authorHandle}
                        <span>
                          {m.role} / {m.kind}
                        </span>
                      </strong>
                      <p>{m.text}</p>
                    </div>
                  ))}
                  {transcript.length > 0 && (
                    <>
                      <label htmlFor="latest">Edit the latest message</label>
                      <textarea
                        id="latest"
                        rows={3}
                        maxLength={
                          transcript.at(-1)?.kind === 'answer'
                            ? CONFIG.limits.answerChars
                            : CONFIG.limits.statementChars
                        }
                        value={editText ?? transcript.at(-1)!.text}
                        onChange={(e) => {
                          setEditText(e.target.value);
                          reset();
                        }}
                      />
                    </>
                  )}
                </details>
                <p className="mode-note">
                  {mode === 'demo'
                    ? 'Demo mode uses known case scripts, with no network calls. Edited cases receive a neutral fallback.'
                    : liveConfigured
                      ? 'Gemini runs on the server. Your API key stays private.'
                      : 'To use live Gemini, add your API key to .env.local and restart the website.'}
                </p>
                <button
                  className="run-button"
                  type="button"
                  onClick={run}
                  disabled={busy || !development || !grievance.trim()}
                >
                  <Gavel />
                  {busy ? 'The court is deliberating…' : 'Call the judge'}
                  <span aria-hidden="true">↗</span>
                </button>
              </fieldset>
            </div>
          </section>
          <section className="output-panel" aria-labelledby="judge-heading">
            <div className="panel-heading">
              <span className="step-number">02</span>
              <h2 id="judge-heading">Hear from the bench</h2>
              <span className="small-caps">THE JUDGE</span>
            </div>
            <div
              className={`judge-stage ${result?.output.safety_flag ? 'safety-stage' : ''}`}
              aria-live="polite"
              aria-busy={busy}
            >
              <div className="stage-top">
                <span>
                  {result?.output.safety_flag ? 'SAFETY INTERRUPT' : 'JUDGE HOLLIS GAVEL'}
                </span>
                <span className="stage-pill">
                  {busy ? 'DELIBERATING' : result ? result.source.toUpperCase() : 'COURT READY'}
                </span>
              </div>
              <div className="judge-medallion">
                <Gavel />
              </div>
              <p className="stage-eyebrow">
                {result?.output.safety_flag
                  ? 'THE COURT HAS PAUSED'
                  : result
                    ? phaseLabels[phase].toUpperCase()
                    : 'YOUR CASE WILL BE HEARD'}
              </p>
              <blockquote>
                {busy
                  ? 'A moment for the record…'
                  : result
                    ? result.output.speech
                    : '“Every carton deserves its day in court.”'}
              </blockquote>
              {!result && !busy && (
                <p className="empty-hint">Choose a case on the left, then call the judge.</p>
              )}
              {result && (
                <div className="result-meta">
                  <span>{result.output.phase}</span>
                  <span>Face: {result.output.face}</span>
                  <span>SFX: {result.output.sfx}</span>
                </div>
              )}
            </div>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            {result && (
              <div className="result-body">
                {result.output.safety_flag ? (
                  <div className="safety-notice">
                    <strong>Pause this case</strong>
                    <p>{result.output.safety_reason}</p>
                    <small>
                      The backend should close the public trial and show its fixed support screen.
                      No verdict is issued.
                    </small>
                  </div>
                ) : (
                  <div className="metrics">
                    <div>
                      <small>LATEST MESSAGE SCORE</small>
                      <strong>{result.output.tone_score.toFixed(2)}</strong>
                    </div>
                    <div>
                      <small>RETURNED IN</small>
                      <strong>
                        {(result.elapsedMs / 1000).toFixed(2)}
                        <span>s</span>
                      </strong>
                    </div>
                    <div>
                      <small>API ATTEMPTS</small>
                      <strong>{result.attempts}</strong>
                    </div>
                  </div>
                )}
                {result.source === 'fallback' && (
                  <p className="notice">
                    {result.reason === 'missing_configuration'
                      ? 'Live credentials are missing.'
                      : 'The live review was unavailable.'}{' '}
                    This is a neutral fallback, not a live AI ruling.
                  </p>
                )}
                {mode === 'demo' && result.source === 'demo' && (
                  <p className="script-note">
                    Scripted preview · a demo response is not a live evaluation.
                  </p>
                )}
                {result.output.verdict && (
                  <div className="verdict-card">
                    <span
                      className={`ruling ${result.output.verdict.ruling === 'guilty' ? 'guilty' : ''}`}
                    >
                      {result.output.verdict.ruling.replaceAll('_', ' ')}
                    </span>
                    <h3>{result.output.verdict.headline}</h3>
                    <ul>
                      {result.output.verdict.findings.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                    {result.output.verdict.sentence && (
                      <p>
                        <strong>Sentence:</strong> {result.output.verdict.sentence}
                      </p>
                    )}
                    {result.output.verdict.cited_precedent && (
                      <p className="precedent">Citing {result.output.verdict.cited_precedent}</p>
                    )}
                  </div>
                )}
                <div className="result-actions">
                  <details>
                    <summary>View structured output</summary>
                    <pre>{JSON.stringify(result.output, null, 2)}</pre>
                  </details>
                  <button type="button" onClick={save}>
                    Save JSON ↓
                  </button>
                </div>
              </div>
            )}
            <div className="bench-footnote">
              <span className="footnote-mark">§</span>
              <p>
                The judge supplies the words and ruling. Your backend teammate updates the tone
                dial, saves the turn, and sends it to the courtroom.
              </p>
            </div>
          </section>
        </div>
      </main>
      <footer>
        <span>
          HUNG JURY <b>·</b> PART 03
        </span>
        <span>{CONFIG.app.disclaimer}</span>
        <span>BUILT FOR PETTY DISPUTES.</span>
      </footer>
    </div>
  );
}
