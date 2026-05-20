import { checkServiceToken } from '@/lib/service-auth';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkServiceToken(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null) as {
    status?: 'done' | 'failed';
    result_summary?: string;
    result_url?: string;
  } | null;

  const status = body?.status ?? 'done';
  if (!['done', 'failed'].includes(status)) {
    return Response.json({ error: 'status must be done or failed' }, { status: 400 });
  }

  const db = getServiceClient();
  const { error } = await db
    .from('try_jobs')
    .update({
      status,
      result_summary: body?.result_summary ?? null,
      result_url: body?.result_url ?? null,
    })
    .eq('id', id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
