import { NextResponse } from 'next/server';
import type { GroupHistoryResponse } from '@/contracts/api';
import type { Precedent } from '@/contracts/types';
import { getServiceClient } from '@/server/db/client';


// GET /api/groups/:id/history — past cases and precedents for the group.
// This is the query Part 3's getPrecedents() also runs against; kept here
// as a thin read for the docket/history UI.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getServiceClient();

  const { data: cases, error } = await db
    .from('cases')
    .select(
      'id, title, filer:filer_id(handle), defendant:defendant_id(handle), verdicts(ruling, headline)',
    )
    .eq('group_id', id)
    .eq('status', 'closed')
    .eq('safety_closed', false)
    .order('closed_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: 'failed to load history' }, { status: 500 });

  const precedents: Precedent[] = (cases ?? [])
    .filter((c: any) => c.verdicts)
    .map((c: any) => ({
      title: c.title,
      plaintiff: c.filer?.handle ?? 'unknown',
      defendant: c.defendant?.handle ?? 'unknown',
      ruling: c.verdicts.ruling,
      summary: c.verdicts.headline,
    }));

  return NextResponse.json<GroupHistoryResponse>({ precedents });
}
