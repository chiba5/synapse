import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

// Mark a channel as read by the current user up to "now"
export async function POST(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { channel_id } = await req.json();
  if (!channel_id) return new Response('channel_id required', { status: 400 });

  const db = getServiceClient();
  const { error } = await db
    .from('channel_reads')
    .upsert(
      { channel_id, reader_id: auth.profile.id, last_read_at: new Date().toISOString() },
      { onConflict: 'channel_id,reader_id' }
    );

  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
}
