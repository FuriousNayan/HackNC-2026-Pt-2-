import { NextResponse } from 'next/server';
import type { LeaderboardEntry, LeaderboardResponse } from '@/contracts/api';
import { getServiceClient } from '@/server/db/client';


// GET /api/groups/:id/leaderboard — guilty counts per handle in the group.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getServiceClient();

  const { data: cases, error } = await db
    .from('cases')
    .select('defendant:defendant_id(handle), verdicts!inner(ruling)')
    .eq('group_id', id)
    .eq('safety_closed', false)
    .in('verdicts.ruling', ['guilty', 'partly_guilty']);
  if (error) return NextResponse.json({ error: 'failed to load leaderboard' }, { status: 500 });

  const counts = new Map<string, number>();
  for (const c of cases ?? []) {
    const handle = (c as any).defendant?.handle ?? 'unknown';
    counts.set(handle, (counts.get(handle) ?? 0) + 1);
  }

  const entries: LeaderboardEntry[] = [...counts.entries()]
    .map(([handle, guiltyCount]) => ({ handle, guiltyCount }))
    .sort((a, b) => b.guiltyCount - a.guiltyCount);

  return NextResponse.json<LeaderboardResponse>({ entries });
}
