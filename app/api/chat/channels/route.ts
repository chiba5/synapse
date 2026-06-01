import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';

export const runtime = 'edge';

export async function GET() {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('channels')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });

  if (error) return new Response(error.message, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return new Response('Unauthorized', { status: 401 });

  const { name } = await req.json();
  const clean = (name ?? '').trim().replace(/^#+/, '').trim();
  if (!clean) return new Response('name required', { status: 400 });
  if (clean.length > 50) return new Response('name too long', { status: 400 });

  const db = getServiceClient();
  const { data, error } = await db
    .from('channels')
    .insert({ name: clean })
    .select('id, name, created_at')
    .single();

  if (error) {
    // unique_violation
    if ((error as any).code === '23505') {
      return new Response('同名のチャンネルが既に存在します', { status: 409 });
    }
    return new Response(error.message, { status: 500 });
  }
  return Response.json(data, { status: 201 });
}
