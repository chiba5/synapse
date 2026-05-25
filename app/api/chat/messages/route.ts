import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

export async function GET(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const channelId = url.searchParams.get('channel_id');
  if (!channelId) return new Response('channel_id required', { status: 400 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('messages')
    .select('*, profiles(email)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return new Response(error.message, { status: 500 });

  // Flatten: add sender_email from profiles join
  const messages = (data ?? []).map((m: any) => ({
    ...m,
    sender_email: m.profiles?.email ?? m.sender_id,
    profiles: undefined,
  }));

  return Response.json(messages);
}

export async function POST(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { channel_id, body, file_url, file_name, file_size } = await req.json();
  if (!channel_id || (!body && !file_url)) {
    return new Response('channel_id and body or file required', { status: 400 });
  }

  const db = getServiceClient();
  const { data: inserted, error: insertError } = await db
    .from('messages')
    .insert({
      channel_id,
      sender_id: auth.profile.id,
      body: body?.trim() || null,
      file_url: file_url || null,
      file_name: file_name || null,
      file_size: file_size || null,
    })
    .select('*, profiles(email)')
    .single();

  if (insertError) return new Response(insertError.message, { status: 500 });

  const message = {
    ...inserted,
    sender_email: (inserted as any).profiles?.email ?? auth.email,
    profiles: undefined,
  };

  return Response.json(message, { status: 201 });
}
