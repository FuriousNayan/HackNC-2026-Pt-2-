import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/contracts/config';
import type { ApiErrorBody, ReportRequest, ReportResponse } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';
import { closeForSafety } from '@/server/caseEngine';

// POST /api/cases/:id/report — "This isn't funny" button.
// limits.reportsToClose reports from different people, or one report from
// an arguer, trigger the safety path.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as ReportRequest;
  const db = getServiceClient();

  const { error: insertErr } = await db
    .from('reports')
    .insert({ case_id: id, reporter_id: user.id, reason: body.reason ?? '' });
  if (insertErr) return NextResponse.json<ApiErrorBody>({ error: 'failed to record report' }, { status: 500 });

  const { data: participant } = await db
    .from('participants')
    .select('role')
    .eq('case_id', id)
    .eq('user_id', user.id)
    .in('role', ['plaintiff', 'defendant'])
    .maybeSingle();

  const { data: reports } = await db.from('reports').select('reporter_id').eq('case_id', id);
  const distinctReporters = new Set((reports ?? []).map((r) => r.reporter_id)).size;

  const shouldClose = Boolean(participant) || distinctReporters >= CONFIG.limits.reportsToClose;
  if (shouldClose) {
    await closeForSafety(id, 'reported by a participant');
  }

  return NextResponse.json<ReportResponse>({ recorded: true, safetyClosed: shouldClose });
}
