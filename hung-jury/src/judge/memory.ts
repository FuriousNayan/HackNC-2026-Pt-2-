import type { SupabaseClient } from '@supabase/supabase-js';
import { CONFIG, JUDGE_CONFIG as C, type Precedent, type Ruling } from '@/contracts';
import { z } from 'zod';
const caseSchema = z.object({
  id: z.string(),
  group_id: z.string(),
  title: z.string(),
  filer_id: z.string(),
  defendant_id: z.string(),
  closed_at: z.string().nullable(),
  safety_closed: z.boolean(),
});
const verdictSchema = z.object({
  case_id: z.string(),
  ruling: z.enum(['guilty', 'not_guilty', 'partly_guilty', 'hung']),
  findings: z.array(z.string()),
  headline: z.string(),
});
const profileSchema = z.object({ id: z.string(), handle: z.string() });
export interface MemoryCase {
  id: string;
  groupId: string;
  title: string;
  plaintiff: string;
  defendant: string;
  ruling: Ruling;
  summary: string;
  closedAt: string | null;
  safetyClosed: boolean;
}
export interface MemoryStore {
  listCompletedCases(groupId: string): Promise<MemoryCase[]>;
}
export type MemoryDatabase = SupabaseClient | MemoryStore;
// Separate query adapter: judgeTurn never imports or calls this module.
export function supabaseMemoryStore(db: SupabaseClient): MemoryStore {
  return {
    async listCompletedCases(groupId) {
      const rows: MemoryCase[] = [];
      const pageSize = C.memoryPageSize;
      for (let offset = 0; ; offset += pageSize) {
        const cases = await db
          .from('cases')
          .select('id,group_id,title,filer_id,defendant_id,closed_at,safety_closed')
          .eq('group_id', groupId)
          .eq('safety_closed', false)
          .in('status', ['verdict', 'closed'])
          .order('closed_at', { ascending: false, nullsFirst: false })
          .order('id')
          .range(offset, offset + pageSize - 1);
        if (cases.error) throw new Error('Could not read group case history');
        const parsed = z.array(caseSchema).parse(cases.data ?? []);
        if (!parsed.length) break;
        const [verdicts, profiles] = await Promise.all([
          db
            .from('verdicts')
            .select('case_id,ruling,findings,headline')
            .in(
              'case_id',
              parsed.map((c) => c.id),
            ),
          db
            .from('profiles')
            .select('id,handle')
            .in('id', [...new Set(parsed.flatMap((c) => [c.filer_id, c.defendant_id]))]),
        ]);
        if (verdicts.error || profiles.error)
          throw new Error('Could not read group verdicts or handles');
        const vs = new Map(
          z
            .array(verdictSchema)
            .parse(verdicts.data ?? [])
            .map((v) => [v.case_id, v]),
        );
        const ps = new Map(
          z
            .array(profileSchema)
            .parse(profiles.data ?? [])
            .map((p) => [p.id, p.handle]),
        );
        for (const c of parsed) {
          const v = vs.get(c.id);
          const plaintiff = ps.get(c.filer_id);
          const defendant = ps.get(c.defendant_id);
          if (!v || !plaintiff || !defendant) continue;
          rows.push({
            id: c.id,
            groupId: c.group_id,
            title: c.title,
            plaintiff,
            defendant,
            ruling: v.ruling,
            summary: v.findings.join(' ').slice(0, C.maxSummaryChars),
            closedAt: c.closed_at,
            safetyClosed: c.safety_closed,
          });
        }
        if (parsed.length < pageSize) break;
      }
      return rows;
    },
  };
}
function storeFor(db: MemoryDatabase): MemoryStore {
  return 'listCompletedCases' in db ? db : supabaseMemoryStore(db);
}
async function eligible(db: MemoryDatabase, groupId: string): Promise<MemoryCase[]> {
  if (!groupId.trim()) throw new Error('A group ID is required');
  const rows = await storeFor(db).listCompletedCases(groupId);
  const seen = new Set<string>();
  return rows.filter((c) => {
    if (c.groupId !== groupId || c.safetyClosed || seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
}
export async function getPrecedents(
  db: MemoryDatabase,
  groupId: string,
  handles: string[],
): Promise<Precedent[]> {
  const rows = await eligible(db, groupId);
  const pair = (c: MemoryCase) =>
    handles.length === 2 && handles.includes(c.plaintiff) && handles.includes(c.defendant);
  rows.sort(
    (a, b) =>
      Number(pair(b)) - Number(pair(a)) ||
      (b.closedAt ?? '').localeCompare(a.closedAt ?? '') ||
      a.id.localeCompare(b.id),
  );
  return rows
    .slice(0, CONFIG.limits.precedentsPerCall)
    .map(({ title, plaintiff, defendant, ruling, summary }) => ({
      title,
      plaintiff,
      defendant,
      ruling,
      summary,
    }));
}
export async function getGuiltyCounts(
  db: MemoryDatabase,
  groupId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = Object.create(null);
  for (const c of await eligible(db, groupId))
    if (c.ruling === 'guilty') counts[c.defendant] = (counts[c.defendant] ?? 0) + 1;
  return counts;
}
