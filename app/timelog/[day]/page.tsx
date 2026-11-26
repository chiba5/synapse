import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isValidDay } from '@/lib/timelog';
import { isTimelogViewer } from '@/lib/timelog-auth';
import { getTimelogDay, getAdjacentDays } from '@/lib/timelog-db';
import Markdown from './TimelogMarkdown';

export const runtime = 'edge';

export default async function TimelogDayPage({ params }: { params: Promise<{ day: string }> }) {
  const { day } = await params;
  if (!(await isTimelogViewer()) || !isValidDay(day)) notFound();

  const [data, adj] = await Promise.all([getTimelogDay(day), getAdjacentDays(day)]);
  if (!data) notFound();

  return (
    <main className="mx-auto max-w-4xl w-full px-4 py-8 space-y-8">
      <div className="flex items-center justify-between text-sm">
        <Link href="/timelog" className="text-muted-foreground hover:text-foreground">← 一覧</Link>
        <div className="flex gap-4">
          {adj.prev ? <Link href={`/timelog/${adj.prev}`} className="hover:underline">← {adj.prev}</Link> : <span />}
          {adj.next ? <Link href={`/timelog/${adj.next}`} className="hover:underline">{adj.next} →</Link> : <span />}
        </div>
      </div>

      {data.diagnosis_html && (
        <section>
          <h2 className="text-lg font-semibold mb-2">診断</h2>
          {/* 手で作った HTML をそのまま出す。sandbox でスクリプト・フォーム・同一オリジン扱いを止める */}
          <iframe
            title={`${day} の診断`}
            srcDoc={data.diagnosis_html}
            sandbox=""
            className="w-full h-[80vh] rounded-lg border border-border bg-white"
          />
        </section>
      )}

      {data.table_md && (
        <section>
          <h2 className="text-lg font-semibold mb-2">何をしていたか</h2>
          <Markdown>{data.table_md}</Markdown>
        </section>
      )}

      {data.summary_md && (
        <details className="rounded-lg border border-border p-4">
          <summary className="cursor-pointer text-sm font-medium">機械のまとめ（操作時間・場所・カメラ）</summary>
          <div className="mt-4">
            <Markdown>{data.summary_md}</Markdown>
          </div>
        </details>
      )}
    </main>
  );
}
