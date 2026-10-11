import { describe, it, expect } from 'vitest';
import { getPrecedents, getGuiltyCounts, type MemoryCase, type MemoryStore } from './memory';
const row = (id: string, patch: Partial<MemoryCase> = {}): MemoryCase => ({
  id,
  groupId: 'kitchen',
  title: `Case ${id}`,
  plaintiff: 'dave',
  defendant: 'maya',
  ruling: 'guilty',
  summary: 'Maya admitted using the shared item.',
  closedAt: '2026-10-10T12:00:00Z',
  safetyClosed: false,
  ...patch,
});
const store = (rows: MemoryCase[]): MemoryStore => ({ listCompletedCases: async () => rows });
describe('group memory', () => {
  it('excludes other groups, safety cases and duplicate records', async () => {
    const s = store([
      row('a'),
      row('a'),
      row('b', { groupId: 'elsewhere' }),
      row('c', { safetyClosed: true }),
    ]);
    expect(await getPrecedents(s, 'kitchen', ['dave', 'maya'])).toHaveLength(1);
    expect(await getGuiltyCounts(s, 'kitchen')).toEqual({ maya: 1 });
  });
  it('prioritizes the same pair and caps precedents at five', async () => {
    const s = store([
      row('same', { closedAt: '2025-01-01T00:00:00Z' }),
      ...Array.from({ length: 7 }, (_, i) => row(String(i), { plaintiff: 'someone' })),
    ]);
    const p = await getPrecedents(s, 'kitchen', ['dave', 'maya']);
    expect(p).toHaveLength(5);
    expect(p[0].title).toBe('Case same');
  });
  it('counts only guilty rulings against the defendant', async () => {
    const s = store([
      row('a'),
      row('b', { ruling: 'not_guilty' }),
      row('c', { ruling: 'hung' }),
      row('d', { ruling: 'partly_guilty' }),
      row('e', { defendant: 'dave' }),
    ]);
    expect(await getGuiltyCounts(s, 'kitchen')).toEqual({ maya: 1, dave: 1 });
  });
  it('handles unusual public handles safely', async () => {
    const counts = await getGuiltyCounts(store([row('a', { defendant: '__proto__' })]), 'kitchen');
    expect(counts['__proto__']).toBe(1);
  });
  it('propagates database failures rather than inventing memory', async () => {
    await expect(
      getPrecedents(
        {
          listCompletedCases: async () => {
            throw new Error('Database unavailable');
          },
        },
        'kitchen',
        [],
      ),
    ).rejects.toThrow('Database unavailable');
  });
});

// Exercise the real Supabase adapter against paginated query results.
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseMemoryStore } from './memory';
type DataRow = Record<string, unknown>;
interface QueryResult {
  data: DataRow[] | null;
  error: { message: string } | null;
}
class Query implements PromiseLike<QueryResult> {
  private rows: DataRow[];
  private offset = 0;
  private end = 999;
  constructor(
    rows: DataRow[],
    private fail = false,
  ) {
    this.rows = [...rows];
  }
  select() {
    return this;
  }
  eq(key: string, value: unknown) {
    this.rows = this.rows.filter((r) => r[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.rows = this.rows.filter((r) => values.includes(r[key]));
    return this;
  }
  order() {
    return this;
  }
  range(start: number, end: number) {
    this.offset = start;
    this.end = end;
    return this;
  }
  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve({
      data: this.fail ? null : this.rows.slice(this.offset, this.end + 1),
      error: this.fail ? { message: 'Database down' } : null,
    }).then(onfulfilled, onrejected);
  }
}
describe('Supabase adapter integration', () => {
  it('counts history beyond the default 1000-row limit and filters private records', async () => {
    const cases = Array.from({ length: 1001 }, (_, i) => ({
      id: String(i),
      group_id: 'kitchen',
      title: `Case ${i}`,
      filer_id: 'p',
      defendant_id: 'd',
      closed_at: '2026-10-10T12:00:00Z',
      safety_closed: false,
      status: 'closed',
    }));
    const privateCase = { ...cases[0], id: 'private', safety_closed: true };
    const otherCase = { ...cases[0], id: 'other', group_id: 'another' };
    const tables: Record<string, DataRow[]> = {
      cases: [...cases, privateCase, otherCase],
      verdicts: [...cases, privateCase, otherCase].map((c) => ({
        case_id: c.id,
        ruling: 'guilty',
        findings: ['A supported finding.', 'An admitted fact.'],
        headline: 'A small dispute',
      })),
      profiles: [
        { id: 'p', handle: 'dave' },
        { id: 'd', handle: 'maya' },
      ],
    };
    const db = { from: (name: string) => new Query(tables[name]) } as unknown as SupabaseClient;
    expect(await getGuiltyCounts(db, 'kitchen')).toEqual({ maya: 1001 });
    const precedents = await getPrecedents(db, 'kitchen', ['dave', 'maya']);
    expect(precedents).toHaveLength(5);
    expect(precedents.every((p) => p.summary.includes('supported'))).toBe(true);
  });
  it('does not hide a query failure as an empty history', async () => {
    const db = { from: () => new Query([], true) } as unknown as SupabaseClient;
    await expect(supabaseMemoryStore(db).listCompletedCases('kitchen')).rejects.toThrow(
      'Could not read',
    );
  });
});
