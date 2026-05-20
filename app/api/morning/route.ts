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
    .from('feed_items')
    .select('id, source, source_url, title, body, summary, category, claude_runnable, created_at')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data: rows, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const { data: reads } = await db
    .from('reads')
    .select('item_id')
    .eq('user_id', auth.profile.id)
    .eq('item_type', 'feed_item')
    .in('item_id', page.map(r => r.id));

  const readSet = new Set((reads ?? []).map(r => r.item_id));
  const data = page.map(r => ({ ...r, is_read: readSet.has(r.id) }));
  const nextCursor = hasMore ? page[page.length - 1].created_at : null;

  return Response.json({ data, nextCursor });
}
