import { isValidDay } from '@/lib/timelog';
import { isTimelogViewer } from '@/lib/timelog-auth';
import { getTimelogDay } from '@/lib/timelog-db';

export const runtime = 'edge';

export async function GET(_req: Request, { params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  if (!(await isTimelogViewer()) || !isValidDay(day)) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  try {
    const data = await getTimelogDay(day);
    if (!data) return Response.json({ error: 'Not found' }, { status: 404 });
    return Response.json({ data });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
