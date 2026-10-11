'use client';

import { useEffect, useState } from 'react';
import { api, type GroupSummary, type HistoryItem, type LeaderboardRow } from '@/ui/api/client';
import { CaseShell } from '@/ui/components/CaseShell';
import { useSession } from '@/ui/session';

const RULING_LABEL: Record<HistoryItem['ruling'], string> = {
  guilty: 'Guilty',
  not_guilty: 'Not guilty',
  partly_guilty: 'Partly guilty',
  hung: 'Hung jury',
};

/** Screen 11: a group's case history and its "most guilty" leaderboard, from the live API. */
export default function HistoryPage() {
  const handle = useSession()?.handle ?? null;
  const [groups, setGroups] = useState<GroupSummary[] | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .groups()
      .then((g) => {
        setGroups(g);
        setGroupId(g[0]?.id ?? null);
      })
      .catch(() => setError(true));
  }, []);

  useEffect(() => {
    if (!groupId) return;
    Promise.all([api.history(groupId), api.leaderboard(groupId)])
      .then(([h, l]) => {
        setHistory(h);
        setBoard(l);
      })
      .catch(() => setError(true));
  }, [groupId]);

  const group = groups?.find((g) => g.id === groupId);

  return (
    <CaseShell handle={handle}>
      <div className="narrow" style={{ maxWidth: 720 }}>
        <div className="page-intro">
          <div className="court-eyebrow mono">
            <span /> THE RECORD <span />
          </div>
          <h1>{group ? <span>{group.name}</span> : 'The record'}</h1>
          {groups && groups.length > 1 ? (
            <select aria-label="Group" value={groupId ?? ''} onChange={(e) => setGroupId(e.target.value)}>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {error ? <p>The record could not load. Sign in and try again.</p> : null}
        {groups && groups.length === 0 ? <p>No cases yet. Once you have been in a trial, it shows up here.</p> : null}

        {history ? (
          <>
            <h2 className="history-heading">Case history</h2>
            <div className="history-list">
              {history.length === 0 ? <p>No finished cases yet.</p> : null}
              {history.map((h) => (
                <div key={h.id} className="parchment history-row">
                  <strong>{h.title}</strong>
                  <span className={`tone-chip ${h.ruling === 'not_guilty' ? 'chip-green' : 'chip-red'}`}>
                    <span />
                    {RULING_LABEL[h.ruling]}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {board ? (
          <>
            <h2 className="history-heading">Most guilty</h2>
            <div className="history-list">
              {board.length === 0 ? <p>Nobody has been found guilty yet.</p> : null}
              {board.map((l) => (
                <div key={l.handle} className="parchment history-row">
                  <span>
                    @{l.handle}
                    {l.habitualOffender ? (
                      <span className="tone-chip chip-red" style={{ marginLeft: 8 }}>
                        <span />
                        Habitual offender
                      </span>
                    ) : null}
                  </span>
                  <span className="mono">{l.guilty} guilty</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </CaseShell>
  );
}
