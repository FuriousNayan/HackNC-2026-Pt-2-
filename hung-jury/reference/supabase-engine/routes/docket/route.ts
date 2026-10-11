import { NextResponse } from 'next/server';
import type { DocketCaseSummary, DocketResponse } from '@/contracts/api';
import { getServiceClient } from '@/server/db/client';


// GET /api/docket — live listed cases with viewer counts.
export async function GET() {
  const db = getServiceClient();
  const { data: cases, error } = await db
    .from('cases')
    .select('id, title, tone_dial, status, filer:filer_id(handle), defendant:defendant_id(handle)')
    .eq('listed', true)
    .eq('safety_closed', false)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'failed to load docket' }, { status: 500 });

  const summaries: DocketCaseSummary[] = [];
  for (const c of cases ?? []) {
    const { count } = await db
      .from('participants')
      .select('user_id', { count: 'exact', head: true })
      .eq('case_id', (c as any).id)
      .eq('role', 'juror');
    summaries.push({
      caseId: (c as any).id,
      title: (c as any).title,
      toneDial: (c as any).tone_dial,
      viewers: count ?? 0,
      status: (c as any).status,
      plaintiffHandle: (c as any).filer?.handle ?? 'unknown',
      defendantHandle: (c as any).defendant?.handle ?? 'unknown',
    });
  }

  return NextResponse.json<DocketResponse>({ cases: summaries });
}
