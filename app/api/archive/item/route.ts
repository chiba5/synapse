import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  if (!id || (type !== 'report' && type !== 'note')) {
    return Response.json({ error: 'invalid params' }, { status: 400 });
  }

  const db = getServiceClient();
  const table = type === 'report' ? 'daily_reports' : 'notes';
  const { data, error } = await db.from(table).select('body').eq('id', id).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ body: data?.body ?? '' });
}
