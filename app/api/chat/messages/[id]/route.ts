import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

// Edit own message body
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const { body } = await req.json();
  const trimmed = (body ?? '').trim();
  if (!trimmed) return new Response('body required', { status: 400 });

  const db = getServiceClient();
  const { data: updated, error } = await db
    .from('messages')
    .update({ body: trimmed, edited_at: new Date().toISOString() })
    .eq('id', id)
    .eq('sender_id', auth.profile.id) // own messages only
    .select('*, profiles!messages_sender_id_fkey(email)')
    .single();

  if (error) return new Response(error.message, { status: 500 });
  if (!updated) return new Response('Not found or not yours', { status: 404 });

  return Response.json({
    ...updated,
    sender_email: (updated as any).profiles?.email ?? auth.email,
    profiles: undefined,
  });
}

// Hard delete own message
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const db = getServiceClient();
  const { error } = await db
    .from('messages')
    .delete()
    .eq('id', id)
    .eq('sender_id', auth.profile.id); // own messages only

  if (error) return new Response(error.message, { status: 500 });
  return new Response(null, { status: 204 });
}
