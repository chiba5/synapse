import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
  const cursor = searchParams.get('cursor');

  const db = getServiceClient();

  let query = db
    .from('daily_reports')
    .select('id, report_date, body, created_at, updated_at, author:profiles!author_id(id, email, display_name)')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data: reports, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const hasMore = reports.length > limit;
  const page = hasMore ? reports.slice(0, limit) : reports;

  const { data: reads } = await db
    .from('reads')
    .select('item_id')
    .eq('user_id', auth.profile.id)
    .eq('item_type', 'daily_report')
    .in('item_id', page.map(r => r.id));

  const readSet = new Set((reads ?? []).map(r => r.item_id));
  const data = page.map(r => ({ ...r, is_read: readSet.has(r.id) }));
  const nextCursor = hasMore ? page[page.length - 1].created_at : null;

  return Response.json({ data, nextCursor });
}

export async function POST(req: Request) {
  const auth = await getAuth();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.body?.trim()) {
    return Response.json({ error: 'body is required' }, { status: 400 });
  }

  const reportDate = body.report_date ?? new Date().toISOString().slice(0, 10);

  const db = getServiceClient();
  const { data, error } = await db
    .from('daily_reports')
    .insert({ author_id: auth.profile.id, report_date: reportDate, body: body.body.trim() })
    .select('id, report_date, body, created_at, updated_at')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data }, { status: 201 });
}
