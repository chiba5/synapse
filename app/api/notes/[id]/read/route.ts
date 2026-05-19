import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getServiceClient();

  const { error } = await db
    .from('reads')
    .upsert(
      { user_id: auth.profile.id, item_type: 'note', item_id: id },
      { onConflict: 'user_id,item_type,item_id' }
    );

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
