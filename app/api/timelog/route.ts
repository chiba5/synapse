import { checkServiceToken } from '@/lib/service-auth';
import { getServiceClient } from '@/lib/supabase';
import { parseTimelogPayload } from '@/lib/timelog';
import { isTimelogViewer } from '@/lib/timelog-auth';
import { listTimelogDays } from '@/lib/timelog-db';

export const runtime = 'edge';

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 });

// 本人以外には存在ごと隠す（404）
export async function GET() {
  if (!(await isTimelogViewer())) return notFound();
  try {
    return Response.json({ data: await listTimelogDays() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

// ローカルの time-log（push_synapse.py）から 1 日分を受け取り、day で upsert する
export async function POST(req: Request) {
  if (!checkServiceToken(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const parsed = parseTimelogPayload(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  // 送られた列だけを更新する（診断を後から足しても表は消えない）
  const db = getServiceClient();
  const { error } = await db.from('timelog_days').upsert(parsed.value, { onConflict: 'day' });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ day: parsed.value.day, saved: Object.keys(parsed.value).filter((k) => k !== 'day') });
}
