import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

// Full-text-ish search over message bodies in a channel.
// Postgres FTS has no built-in Japanese tokenizer, so ILIKE substring is the
// pragmatic choice for a low-volume 2-person chat.
export async function GET(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const channelId = url.searchParams.get('channel_id');
  const q = (url.searchParams.get('q') ?? '').trim();
  if (!channelId) return new Response('channel_id required', { status: 400 });
  if (!q) return Response.json([]);

  // Escape ILIKE wildcards in the user's query
  const escaped = q.replace(/[\\%_]/g, m => '\\' + m);

  const db = getServiceClient();
  const { data, error } = await db
    .from('messages')
    .select('id, body, created_at, profiles!messages_sender_id_fkey(email)')
    .eq('channel_id', channelId)
    .ilike('body', `%${escaped}%`)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return new Response(error.message, { status: 500 });

  const results = (data ?? []).map((m: any) => ({
    id: m.id,
    sender_email: m.profiles?.email ?? m.sender_id,
    body: m.body,
    created_at: m.created_at,
  }));

  return Response.json(results);
}
