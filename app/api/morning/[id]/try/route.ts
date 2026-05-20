import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getServiceClient();

  const { data: item } = await db
    .from('feed_items')
    .select('id, claude_runnable')
    .eq('id', id)
    .single();

  if (!item?.claude_runnable) {
    return Response.json({ error: 'This item is not marked as runnable' }, { status: 400 });
  }

  const { error } = await db
    .from('try_jobs')
    .insert({ feed_item_id: id, requested_by: auth.profile.id });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true }, { status: 201 });
}
