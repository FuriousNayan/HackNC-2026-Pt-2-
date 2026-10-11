import { NextRequest, NextResponse } from 'next/server';
import { CONFIG } from '@/contracts/config';
import type { ApiErrorBody, CreateCaseRequest, CreateCaseResponse } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';
import { checkFilingRateLimit } from '@/server/rateLimits';
import { prepareText } from '@/integration';

// POST /api/cases — file a case. Redacts the grievance, creates the group
// if needed, sends the summons. Rate limited by limits.filingsPerHour.
export async function POST(req: NextRequest) {
  const user = await getAuthedUser();
  if (!user) {
    return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });
  }

  const body = (await req.json()) as CreateCaseRequest;
  if (!body.title || !body.grievance || !body.defendantHandleOrInvite) {
    return NextResponse.json<ApiErrorBody>({ error: 'missing title, grievance, or defendant' }, { status: 400 });
  }
  if (body.grievance.length > CONFIG.limits.grievanceChars) {
    return NextResponse.json<ApiErrorBody>(
      { error: `grievance exceeds ${CONFIG.limits.grievanceChars} characters` },
      { status: 400 },
    );
  }

  const allowed = await checkFilingRateLimit(user.id);
  if (!allowed) {
    return NextResponse.json<ApiErrorBody>(
      { error: `filing limit reached (${CONFIG.limits.filingsPerHour} per hour)` },
      { status: 429 },
    );
  }

  const db = getServiceClient();

  const { data: defendant } = await db
    .from('profiles')
    .select('id, handle')
    .eq('handle', body.defendantHandleOrInvite)
    .maybeSingle();
  if (!defendant) {
    return NextResponse.json<ApiErrorBody>({ error: 'defendant handle not found' }, { status: 404 });
  }

  let { data: group } = await db
    .from('groups')
    .select('id, group_members!inner(user_id)')
    .eq('group_members.user_id', user.id)
    .maybeSingle();

  // Auto-create a group for this pair if they have never faced each other.
  if (!group) {
    const { data: newGroup, error: groupErr } = await db
      .from('groups')
      .insert({ name: `${user.handle} & ${defendant.handle}` })
      .select('id')
      .single();
    if (groupErr || !newGroup) {
      return NextResponse.json<ApiErrorBody>({ error: 'failed to create group' }, { status: 500 });
    }
    group = newGroup as any;
    await db.from('group_members').insert([
      { group_id: group!.id, user_id: user.id },
      { group_id: group!.id, user_id: defendant.id },
    ]);
  }

  const preparedGrievance = prepareText(body.grievance);
  if (!preparedGrievance.ok) {
    return NextResponse.json<ApiErrorBody>(
      { error: 'grievance was held by the safety pre-filter' },
      { status: 422 },
    );
  }

  const { data: created, error: caseErr } = await db
    .from('cases')
    .insert({
      group_id: group!.id,
      title: body.title,
      grievance: preparedGrievance.text,
      sentence_request: body.sentenceRequest ?? null,
      filer_id: user.id,
      defendant_id: defendant.id,
      defendant_handle_or_invite: body.defendantHandleOrInvite,
      status: 'filed',
    })
    .select('id, status')
    .single();
  if (caseErr || !created) {
    return NextResponse.json<ApiErrorBody>({ error: 'failed to file case' }, { status: 500 });
  }

  await db.from('participants').insert({ case_id: created.id, user_id: user.id, role: 'plaintiff' });

  return NextResponse.json<CreateCaseResponse>({ caseId: created.id, status: created.status });
}
