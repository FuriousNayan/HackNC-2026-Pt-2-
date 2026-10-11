import { NextRequest, NextResponse } from 'next/server';
import type { ApiErrorBody, PostMessageRequest, PostMessageResponse } from '@/contracts/api';
import { getAuthedUser } from '@/server/auth';
import { getServiceClient } from '@/server/db/client';
import { postMessage, SafetyHoldError } from '@/server/caseEngine';

// POST /api/cases/:id/message — the active arguer submits a statement or
// answer. Runs the redaction and pre-filter, stores it, then calls the
// judge. Safe to retry: a repeated clientMessageId returns the existing row
// instead of inserting a duplicate or calling the judge twice.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json<ApiErrorBody>({ error: 'not signed in' }, { status: 401 });

  const body = (await req.json()) as PostMessageRequest;
  if (!body.text || !body.clientMessageId) {
    return NextResponse.json<ApiErrorBody>({ error: 'missing text or clientMessageId' }, { status: 400 });
  }

  const db = getServiceClient();
  const { data: caseRow, error } = await db.from('cases').select('*').eq('id', id).single();
  if (error || !caseRow) return NextResponse.json<ApiErrorBody>({ error: 'case not found' }, { status: 404 });
  if (caseRow.status !== 'live') {
    return NextResponse.json<ApiErrorBody>({ error: `case is ${caseRow.status}, not live` }, { status: 409 });
  }

  const { data: participant } = await db
    .from('participants')
    .select('role')
    .eq('case_id', id)
    .eq('user_id', user.id)
    .in('role', ['plaintiff', 'defendant'])
    .maybeSingle();
  if (!participant) {
    return NextResponse.json<ApiErrorBody>({ error: 'not an arguer in this case' }, { status: 403 });
  }

  const kind = caseRow.phase === 'cross' ? 'answer' : caseRow.phase === 'closing' ? 'closing' : 'statement';

  try {
    const result = await postMessage({
      caseId: id,
      authorId: user.id,
      text: body.text,
      clientMessageId: body.clientMessageId,
      kind,
    });
    return NextResponse.json<PostMessageResponse>({
      messageId: result.messageId,
      stored: true,
      deduped: result.deduped,
    });
  } catch (e) {
    if (e instanceof SafetyHoldError) {
      return NextResponse.json<PostMessageResponse>({ messageId: '', stored: false, deduped: false }, { status: 200 });
    }
    const message = e instanceof Error ? e.message : 'failed to post message';
    return NextResponse.json<ApiErrorBody>({ error: message }, { status: 400 });
  }
}
