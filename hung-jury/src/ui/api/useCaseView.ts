'use client';

import { useEffect, useState } from 'react';
import { api, type CaseViewResponse } from './client';
import { USE_MOCKS } from '../room/useRoom';

/**
 * Live case details (seats, presence, your role, title). Polling the view also counts as presence on the server.
 * Returns null in mock mode, where pages use the demo data instead. `error` is true when the case is not found.
 */
export function useCaseView(id: string, intervalMs = 2000) {
  const [view, setView] = useState<CaseViewResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (USE_MOCKS) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      try {
        const v = await api.view(id);
        if (!alive) return;
        setView(v);
        setError(false);
      } catch {
        if (alive) setError(true);
      }
      if (alive) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, intervalMs]);

  return { view, error };
}
