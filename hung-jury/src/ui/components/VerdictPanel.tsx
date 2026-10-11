'use client';

import { Scale, Share2 } from 'lucide-react';
import { CONFIG, type JudgeOutput, type Ruling } from '@/contracts';
import { LjButton } from './LjButton';

const RULING_LABEL: Record<Ruling, string> = {
  guilty: 'GUILTY',
  not_guilty: 'NOT GUILTY',
  partly_guilty: 'PARTLY GUILTY',
  hung: 'HUNG',
};

export interface VerdictPanelProps {
  verdict: NonNullable<JudgeOutput['verdict']>;
  guiltyPct: number;
  notGuiltyPct: number;
  caseId: string;
  onShare: () => void;
}

/** Share text used by the share button. Kept here so the card and the text agree. */
export function verdictShareText(
  verdict: NonNullable<JudgeOutput['verdict']>,
  guiltyPct: number,
  notGuiltyPct: number,
): string {
  const jury = notGuiltyPct >= guiltyPct ? `${notGuiltyPct}% not guilty` : `${guiltyPct}% guilty`;
  return [
    `Hung Jury: ${verdict.headline}`,
    ...verdict.findings,
    verdict.sentence ? `Sentence: ${verdict.sentence}` : '',
    verdict.cited_precedent ? `As established in ${verdict.cited_precedent}.` : '',
    `Judge: ${verdict.ruling.replaceAll('_', ' ')} / Jury: ${jury}`,
    CONFIG.app.disclaimer,
  ]
    .filter(Boolean)
    .join('\n');
}

export function VerdictPanel({ verdict, guiltyPct, notGuiltyPct, caseId, onShare }: VerdictPanelProps) {
  const jury = notGuiltyPct >= guiltyPct ? `${notGuiltyPct}% not guilty` : `${guiltyPct}% guilty`;
  return (
    <article className={`parchment verdict-panel ruling-${verdict.ruling}`} aria-label="Case verdict">
      <span className="mono eyebrow">THE COURT HAS SPOKEN</span>
      <div className="verdict-stamp">{RULING_LABEL[verdict.ruling]}</div>
      <h2>{verdict.headline}</h2>
      <ul>
        {verdict.findings.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
      {verdict.sentence ? (
        <p className="sentence">
          <strong>Sentence:</strong> {verdict.sentence}
        </p>
      ) : null}
      {verdict.cited_precedent ? <p className="precedent">As established in {verdict.cited_precedent}.</p> : null}
      <section className="judge-vs-jury">
        <h4>
          <Scale size={16} /> Judge vs Jury of Public Opinion
        </h4>
        <div>
          <span>
            <small>THE BENCH</small>Judge: {verdict.ruling.replaceAll('_', ' ')}
          </span>
          <span>
            <small>THE PEOPLE</small>Jury: {jury}
          </span>
        </div>
      </section>
      <LjButton size="lg" onClick={onShare} data-card-url={`/api/cases/${caseId}/card?format=portrait`}>
        Share verdict card <Share2 />
      </LjButton>
      <p className="verdict-disclaimer">{CONFIG.app.disclaimer}</p>
    </article>
  );
}
