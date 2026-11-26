import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isTimelogViewer } from '@/lib/timelog-auth';
import { listTimelogDays } from '@/lib/timelog-db';
import type { TimelogListItem } from './types';

export const runtime = 'edge';

const WD = '日月火水木金土';

function label(day: string) {
  const d = new Date(`${day}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}（${WD[d.getUTCDay()]}）`;
}

export default async function TimelogPage() {
  // 本人以外には存在ごと隠す
  if (!(await isTimelogViewer())) notFound();

  let days: TimelogListItem[] = [];
  let failed = false;
  try {
    days = await listTimelogDays();
  } catch {
    failed = true;
  }

  return (
    <main className="mx-auto max-w-2xl w-full px-4 py-8">
      <h1 className="text-xl font-semibold mb-1">時間の記録</h1>
      <p className="text-sm text-muted-foreground mb-6">毎朝 4:30 に前日分の表が届きます（自分だけに表示）</p>
      {failed && <p className="text-sm text-red-500">データベースに接続できませんでした。</p>}
      {!failed && days.length === 0 && <p className="text-sm text-muted-foreground">まだ記録がありません。</p>}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {days.map((d) => (
          <li key={d.day}>
            <Link href={`/timelog/${d.day}`} className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/60">
              <span className="w-20 shrink-0 text-sm font-medium">{label(d.day)}</span>
              <span className="flex-1 text-sm text-muted-foreground">
                {d.pc && <>PC {d.pc}</>}
                {d.pc && d.phone && '・'}
                {d.phone && <>スマホ {d.phone}</>}
                {!d.pc && !d.phone && (d.headline ?? '')}
              </span>
              <span className="flex gap-1 text-xs">
                {d.has_table && <span className="rounded bg-secondary px-1.5 py-0.5">表</span>}
                {d.has_diagnosis && <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5">診断</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
