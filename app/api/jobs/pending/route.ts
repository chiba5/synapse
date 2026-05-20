import { checkServiceToken } from '@/lib/service-auth';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET(req: Request) {
  if (!checkServiceToken(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getServiceClient();

  const { data, error } = await db
    .from('try_jobs')
    .select('id, feed_item_id, requested_by, status, created_at, feed_items(id, title, summary, source_url)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(10);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ jobs: data ?? [] });
}
