import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

// Rename a channel. #general is protected. Name rules match POST /api/chat/channels.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const { name } = await req.json();
  const clean = (name ?? '').trim().replace(/^#+/, '').trim();
  if (!clean) return new Response('name required', { status: 400 });
  if (clean.length > 50) return new Response('name too long', { status: 400 });

  const db = getServiceClient();

  const { data: channel } = await db
    .from('channels')
    .select('name')
    .eq('id', id)
    .maybeSingle();

  if (!channel) return new Response('Not found', { status: 404 });
  if (channel.name === 'general') {
    return new Response('#general は名前を変更できません', { status: 403 });
  }

  const { data, error } = await db
    .from('channels')
    .update({ name: clean })
    .eq('id', id)
    .select('id, name, created_at')
    .single();

  if (error) {
    if ((error as any).code === '23505') {
      return new Response('同名のチャンネルが既に存在します', { status: 409 });
    }
    return new Response(error.message, { status: 500 });
  }
  return Response.json(data);
}

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
