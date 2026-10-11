// Wires Part 2's auth and database into Part 4's media runtime
// (docs/BACKEND-HANDOFF.md section 3, "Initialize adapters in every server
// bundle"). Every route that calls an authorize-gated media function
// (POST /api/avatar, POST /api/tts, GET /api/cases/:id/card) must call
// ensureMediaConfigured() before using it. speak()'s default storage
// adapter reads SUPABASE_MEDIA_BUCKET directly and needs no configuration
// here; only `authorize` and `loadVerdict` are gated.

// Imports from '@/media/runtime' directly rather than the '@/media' barrel:
// the barrel's top-level `import 'server-only'` would break
// tests/media.test.ts, which imports src/app/api/avatar/route.ts and
// src/app/api/tts/route.ts (and, through them, this module) under plain
// Node. This file is still never reachable from a client component —
// nothing under src/components imports it.
import { configureMedia } from '@/media/runtime';
import type { VerdictCardData } from '@/contracts/types';
import { getAuthedUser } from './auth';
import { getServiceClient } from './db/client';

let configured = false;

export function ensureMediaConfigured(): void {
  if (configured) return;
  configured = true;

  configureMedia({
    authorize: async (_request, action, speech) => {
      // getAuthedUser() reads the ambient request's cookies/headers via
      // next/headers, which reflects whatever request is currently being
      // handled by the route calling authorizeMedia() — the explicit
      // `request` parameter is Part 4's generic web Request and isn't
      // needed here.
      const user = await getAuthedUser();
      if (!user) return null;

      if (action === 'tts' && speech) {
        // Verify this exact speech belongs to an authorized, persisted
        // judge turn the caller is allowed to see — ordinary session auth
        // alone would let any signed-in user generate arbitrary voice.
        const db = getServiceClient();
        const { data: turn } = await db
          .from('judge_turns')
          .select('case_id, speech, cases!inner(filer_id, defendant_id, listed, safety_closed)')
          .eq('speech', speech.text)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!turn) return null;
        const c = (turn as any).cases;
        const canSee = c.filer_id === user.id || c.defendant_id === user.id || (c.listed && !c.safety_closed);
        if (!canSee) return null;
      }

      return { userId: user.id };
    },

    loadVerdict: async (caseId: string, _format): Promise<VerdictCardData> => {
      const user = await getAuthedUser();
      if (!user) throw new Error('not signed in');

      const db = getServiceClient();
      const { data: caseRow, error: caseErr } = await db.from('cases').select('*').eq('id', caseId).single();
      if (caseErr || !caseRow) throw new Error('case not found');

      const canSee = caseRow.filer_id === user.id || caseRow.defendant_id === user.id || caseRow.listed;
      if (!canSee) throw new Error('not authorized to view this case');
      if (caseRow.safety_closed) throw new Error('verdict cards are unavailable for safety-closed cases');

      const { data: verdict, error: verdictErr } = await db
        .from('verdicts')
        .select('*')
        .eq('case_id', caseId)
        .maybeSingle();
      if (verdictErr || !verdict) throw new Error('no final verdict for this case yet');

      const { data: profiles } = await db
        .from('profiles')
        .select('id, handle')
        .in('id', [caseRow.filer_id, caseRow.defendant_id].filter(Boolean));
      const byId = new Map((profiles ?? []).map((p) => [p.id, p.handle]));

      return {
        caseId,
        caseNumber: caseId.slice(0, 8).toUpperCase(),
        title: caseRow.title,
        plaintiff: byId.get(caseRow.filer_id) ?? 'unknown',
        defendant: byId.get(caseRow.defendant_id) ?? 'unknown',
        ruling: verdict.ruling,
        headline: verdict.headline,
        sentence: verdict.sentence,
        toneDial: caseRow.tone_dial,
        juryGuiltyPct: verdict.jury_guilty_pct ?? 0,
        safetyClosed: false,
      };
    },
  });
}
