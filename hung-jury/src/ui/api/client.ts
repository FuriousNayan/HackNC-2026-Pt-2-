'use client';

import { accessToken } from '@/ui/supabaseAuth';
import type { Reaction } from '@/contracts';
import { USE_MOCKS } from '../room/useRoom';

/**
 * Thin client for the API routes. Request and response types are local until Part 2 publishes
 * src/contracts/api.ts at the end of phase 1; then replace these with imports from '@/contracts'.
 * In mock mode every call resolves with a canned response and never touches the network.
 */

export interface DocketItem {
  id: string;
  /** display case number, for example HJ-0024 */
  number: string;
  /** short label above the title, for example Kitchen crimes */
  category: string;
  /** one line teaser shown on the featured case */
  blurb: string;
  title: string;
  tone: number;
  viewers: number;
  status: 'live' | 'accepted';
  plaintiff: string;
  defendant: string;
}

export const MOCK_DOCKET: DocketItem[] = [
  {
    id: 'demo-oat-milk',
    number: 'HJ-0024',
    category: 'Kitchen crimes',
    blurb: 'A stolen splash. A broken trust. A very heated kitchen.',
    title: 'The Case of the Missing Oat Milk',
    tone: 0.75,
    viewers: 14,
    status: 'live',
    plaintiff: 'dave',
    defendant: 'maya',
  },
  {
    id: 'demo-thermostat',
    number: 'HJ-0025',
    category: 'Roommate justice',
    blurb: 'Sixty-eight degrees, two roommates, zero compromise.',
    title: 'The Thermostat Cold War',
    tone: 0.4,
    viewers: 28,
    status: 'live',
    plaintiff: 'ellie',
    defendant: 'sam',
  },
  {
    id: 'demo-group-chat',
    number: 'HJ-0026',
    category: 'Social offenses',
    blurb: 'Seen at 9:14 pm. No reply since.',
    title: 'Leaving the Group Chat on Read',
    tone: 0.92,
    viewers: 9,
    status: 'live',
    plaintiff: 'leo',
    defendant: 'nina',
  },
];

export interface FileCaseRequest {
  title: string;
  grievance: string;
  defendantHandle: string;
  sentenceRequest?: string;
}

async function post<T>(url: string, body?: unknown, mock?: T, extraHeaders?: Record<string, string>): Promise<T> {
  if (USE_MOCKS) return mock as T;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
  return (await res.json()) as T;
}

async function get<T>(url: string, mock: T): Promise<T> {
  if (USE_MOCKS) return mock;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed with ${res.status}`);
  return (await res.json()) as T;
}

export interface CaseSeat {
  handle: string;
  headImageUrl: string;
}

/** GET /api/cases/:id. See docs/team/PART2.md for the full shape. */
export interface CaseViewResponse {
  id: string;
  number: string;
  title: string;
  grievance: string;
  status: 'filed' | 'accepted' | 'live' | 'verdict' | 'closed';
  phase: string;
  safetyClosed: boolean;
  plaintiff: CaseSeat;
  defendant: CaseSeat | null;
  present: { plaintiff: boolean; defendant: boolean };
  you: { handle: string; role: 'plaintiff' | 'defendant' | 'juror' | null };
}

export interface GroupSummary {
  id: string;
  name: string;
}
export interface HistoryItem {
  id: string;
  title: string;
  plaintiff: string;
  defendant: string;
  ruling: 'guilty' | 'not_guilty' | 'partly_guilty' | 'hung';
  headline: string;
  closedAt: string | null;
}
export interface LeaderboardRow {
  handle: string;
  guilty: number;
  habitualOffender: boolean;
}

export const api = {
  groups: () => get<GroupSummary[]>('/api/groups', [{ id: 'the-kitchen', name: 'The Kitchen' }]),
  history: (groupId: string) =>
    get<HistoryItem[]>(`/api/groups/${groupId}/history`, [
      { id: 'a', title: 'Dave v. The Missing Pizza', plaintiff: 'dave', defendant: 'maya', ruling: 'guilty', headline: '', closedAt: null },
      { id: 'b', title: 'Maya v. The Thermostat', plaintiff: 'maya', defendant: 'dave', ruling: 'not_guilty', headline: '', closedAt: null },
    ]),
  leaderboard: (groupId: string) =>
    get<LeaderboardRow[]>(`/api/groups/${groupId}/leaderboard`, [
      { handle: 'dave', guilty: 3, habitualOffender: true },
      { handle: 'maya', guilty: 1, habitualOffender: false },
    ]),
  /** Claims the handle and sets the session cookie. Throws with status 409 when the handle is taken. */
  session: async (handle: string, avatar?: { kind: string; headImageUrl: string }) => {
    // With Supabase Auth on, the access token proves who is claiming the handle.
    const token = await accessToken();
    return post<{ handle: string }>('/api/session', { handle, avatar }, { handle }, token ? { 'x-sb-token': token } : undefined);
  },
  view: (id: string) => get<CaseViewResponse | null>(`/api/cases/${id}`, null),
  docket: () =>
    get<DocketItem[]>('/api/docket', MOCK_DOCKET),
  fileCase: (req: FileCaseRequest) => post<{ id: string }>('/api/cases', req, { id: 'demo-oat-milk' }),
  accept: (id: string) => post<{ ok: true }>(`/api/cases/${id}/accept`, undefined, { ok: true }),
  decline: (id: string) => post<{ ok: true }>(`/api/cases/${id}/decline`, undefined, { ok: true }),
  start: (id: string) => post<{ ok: true }>(`/api/cases/${id}/start`, undefined, { ok: true }),
  message: (id: string, text: string) => post<{ ok: true }>(`/api/cases/${id}/message`, { text }, { ok: true }),
  join: (id: string) => post<{ ok: true }>(`/api/cases/${id}/join`, undefined, { ok: true }),
  vote: (id: string, vote: 'guilty' | 'not_guilty') => post<{ ok: true }>(`/api/cases/${id}/vote`, { vote }, { ok: true }),
  react: (id: string, kind: Reaction) => post<{ ok: true }>(`/api/cases/${id}/react`, { kind }, { ok: true }),
  report: (id: string, reason: string) => post<{ ok: true }>(`/api/cases/${id}/report`, { reason }, { ok: true }),
};
