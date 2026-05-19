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
    .from('notes')
    .select('id, title, body, created_at, updated_at, author:profiles!author_id(id, email, display_name)')
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  if (cursor) query = query.lt('created_at', cursor);

  const { data: notes, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const hasMore = notes.length > limit;
  const page = hasMore ? notes.slice(0, limit) : notes;

  const { data: reads } = await db
    .from('reads')
    .select('item_id')
    .eq('user_id', auth.profile.id)
    .eq('item_type', 'note')
    .in('item_id', page.map(n => n.id));

  const readSet = new Set((reads ?? []).map(r => r.item_id));
  const data = page.map(n => ({ ...n, is_read: readSet.has(n.id) }));
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

  const db = getServiceClient();
  const { data, error } = await db
    .from('notes')
    .insert({
      author_id: auth.profile.id,
      title: body.title?.trim() || null,
      body: body.body.trim(),
    })
    .select('id, title, body, created_at, updated_at')
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ data }, { status: 201 });
}
