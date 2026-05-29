import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

// Toggle an emoji reaction on a message for the current user
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { id } = await params;
  const { emoji } = await req.json();
  if (!emoji) return new Response('emoji required', { status: 400 });

  const db = getServiceClient();
  const readerId = auth.profile.id;

  // Already reacted with this emoji? → remove. Otherwise → add.
  const { data: existing } = await db
    .from('message_reactions')
    .select('emoji')
    .eq('message_id', id)
    .eq('reader_id', readerId)
    .eq('emoji', emoji)
    .maybeSingle();

  if (existing) {
    const { error } = await db
      .from('message_reactions')
      .delete()
      .eq('message_id', id)
      .eq('reader_id', readerId)
      .eq('emoji', emoji);
    if (error) return new Response(error.message, { status: 500 });
    return Response.json({ toggled: 'removed' });
  }

  const { error } = await db
    .from('message_reactions')
    .insert({ message_id: id, reader_id: readerId, emoji });
  if (error) return new Response(error.message, { status: 500 });
  return Response.json({ toggled: 'added' });
}
