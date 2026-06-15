import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import {
  escapeIlike, normalizeReport, normalizeNews, normalizeNote,
  mergeByCreatedAtDesc, aggregateCalendar, applyReadState,
  jstMonthRangeUtc, jstDayRangeUtc, toJstDate,
  type ReportRow, type NewsRow, type NoteRow,
} from '@/lib/archive';
import type { ArchiveItem, ArchiveType } from '@/app/archive/types';

export const runtime = 'edge';

type Db = ReturnType<typeof getServiceClient>;

const ALL_TYPES: ArchiveType[] = ['report', 'news', 'note'];

function resolveTypes(param: string | null): ArchiveType[] {
  if (!param || param === 'all') return ALL_TYPES;
  return ALL_TYPES.filter(t => t === param);
}

export async function GET(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const db = getServiceClient();
  const types = resolveTypes(searchParams.get('type'));

  if (searchParams.get('view') === 'calendar') {
    return calendarResponse(db, searchParams, types);
  }
  return listResponse(db, auth.profile.id, searchParams, types);
}

async function listResponse(
  db: Db, profileId: string, searchParams: URLSearchParams, types: ArchiveType[],
) {
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
  const cursor = searchParams.get('cursor');
  const date = searchParams.get('date'); // 暦の当日パネル用（YYYY-MM-DD）
  const rawQ = (searchParams.get('q') ?? '').trim();
  const q = rawQ ? escapeIlike(rawQ) : null;
  // PostgREST .or() splits on commas and treats parens as syntax, so strip them
  // to keep a comma/paren in the query from corrupting the filter (→ 500).
  // Reports use single-column .ilike and are unaffected. Trade-off: literal
  // , ( ) aren't searchable in notes/news (acceptable for a 2-person app).
  const qOr = q ? q.replace(/[(),]/g, ' ').trim() : null;
  const category = searchParams.get('category');
  const day = date ? jstDayRangeUtc(date) : null;
  const fetchLimit = date ? 200 : limit + 1; // 単日は全件、それ以外はページ単位

  const collected: ArchiveItem[] = [];

  if (types.includes('report')) {
    let rq = db.from('daily_reports')
      .select('id, report_date, body, created_at, author:profiles!daily_reports_author_id_fkey(id, email, display_name)')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (date) rq = rq.eq('report_date', date);
    if (cursor && !date) rq = rq.lt('created_at', cursor);
    if (q) rq = rq.ilike('body', `%${q}%`);
    const { data } = await rq;
    for (const r of (data ?? []) as unknown as ReportRow[]) collected.push(normalizeReport(r, false));
  }

  if (types.includes('note')) {
    let nq = db.from('notes')
      .select('id, title, body, created_at, author:profiles!notes_author_id_fkey(id, email, display_name)')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (day) nq = nq.gte('created_at', day.startUtc).lt('created_at', day.endUtc);
    if (cursor && !date) nq = nq.lt('created_at', cursor);
    if (qOr) nq = nq.or(`title.ilike.%${qOr}%,body.ilike.%${qOr}%`);
    const { data } = await nq;
    for (const n of (data ?? []) as unknown as NoteRow[]) collected.push(normalizeNote(n, false));
  }

  if (types.includes('news')) {
    let fq = db.from('feed_items')
      .select('id, source, source_url, title, body, summary, category, claude_runnable, created_at')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (day) fq = fq.gte('created_at', day.startUtc).lt('created_at', day.endUtc);
    if (cursor && !date) fq = fq.lt('created_at', cursor);
    if (category) fq = fq.eq('category', category);
    if (qOr) fq = fq.or(`title.ilike.%${qOr}%,body.ilike.%${qOr}%,summary.ilike.%${qOr}%`);
    const { data } = await fq;
    for (const f of (data ?? []) as unknown as NewsRow[]) collected.push(normalizeNews(f, false));
  }

  const merged = mergeByCreatedAtDesc(collected);
  const hasMore = !date && merged.length > limit;
  const page = hasMore ? merged.slice(0, limit) : merged;

  const ids = page.map(i => i.id);
  if (ids.length) {
    const { data: reads } = await db.from('reads')
      .select('item_type, item_id')
      .eq('user_id', profileId)
      .in('item_id', ids);
    const readSet = new Set((reads ?? []).map(r => `${r.item_type}:${r.item_id}`));
    applyReadState(page, readSet);
  }

  const nextCursor = hasMore ? page[page.length - 1].created_at : null;
  return Response.json({ data: page, nextCursor });
}

async function calendarResponse(db: Db, searchParams: URLSearchParams, types: ArchiveType[]) {
  const month = searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month=YYYY-MM required' }, { status: 400 });
  }
  const { startUtc, endUtc, firstDay, nextFirstDay } = jstMonthRangeUtc(month);
  const entries: Array<{ type: ArchiveType; date: string }> = [];

  if (types.includes('report')) {
    const { data } = await db.from('daily_reports')
      .select('report_date')
      .gte('report_date', firstDay).lt('report_date', nextFirstDay);
    for (const r of data ?? []) entries.push({ type: 'report', date: r.report_date as string });
  }
  if (types.includes('note')) {
    const { data } = await db.from('notes')
      .select('created_at')
      .gte('created_at', startUtc).lt('created_at', endUtc);
    for (const n of data ?? []) entries.push({ type: 'note', date: toJstDate(n.created_at as string) });
  }
  if (types.includes('news')) {
    const { data } = await db.from('feed_items')
      .select('created_at')
      .gte('created_at', startUtc).lt('created_at', endUtc);
    for (const f of data ?? []) entries.push({ type: 'news', date: toJstDate(f.created_at as string) });
  }

  return Response.json({ counts: aggregateCalendar(entries) });
}
