import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

// Delete a channel (and its messages via ON DELETE CASCADE). #general is protected.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const db = getServiceClient();

  const { data: channel } = await db
    .from('channels')
    .select('name')
    .eq('id', id)
    .maybeSingle();

  if (!channel) return new Response('Not found', { status: 404 });
  if (channel.name === 'general') {
    return new Response('#general は削除できません', { status: 403 });
  }

  const { error } = await db.from('channels').delete().eq('id', id);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
}
