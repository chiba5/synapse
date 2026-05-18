import { redirect } from 'next/navigation';
import { getCurrentEmail } from '@/lib/user';
import { ensureProfile } from '@/lib/profiles';
import { getServiceClient } from '@/lib/supabase';
import DailyReportsFeed from './DailyReportsFeed';
import type { Report } from './types';

export const runtime = 'edge';

const PAGE_SIZE = 20;

async function getInitialData(profileId: string) {
  try {
  const db = getServiceClient();

  const { data: rows, error } = await db
    .from('daily_reports')
    .select('id, report_date, body, created_at, updated_at, author:profiles!author_id(id, email, display_name)')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE + 1);

  if (error || !rows) return { data: [] as Report[], nextCursor: null };

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const { data: reads } = await db
    .from('reads')
    .select('item_id')
    .eq('user_id', profileId)
    .eq('item_type', 'daily_report')
    .in('item_id', page.map(r => r.id));

  const readSet = new Set((reads ?? []).map(r => r.item_id));

  return {
    data: page.map(r => {
      const author = Array.isArray(r.author) ? r.author[0] : r.author;
      return {
        id: r.id as string,
        report_date: r.report_date as string,
        body: r.body as string,
        created_at: r.created_at as string,
        is_read: readSet.has(r.id),
        author: {
          id: author.id as string,
          email: author.email as string,
          display_name: (author.display_name ?? null) as string | null,
        },
      };
    }),
    nextCursor: hasMore ? (page[page.length - 1].created_at as string) : null,
  };
  } catch {
    return { data: [] as Report[], nextCursor: null };
  }
}

export default async function DailyReportsPage() {
  const email = await getCurrentEmail().catch(() => null);
  if (!email) redirect('/');

  const profile = await ensureProfile(email).catch(() => null);
  if (!profile) {
    return (
      <main className="mx-auto max-w-2xl w-full px-4 py-8">
        <p className="text-sm text-red-500">データベースに接続できませんでした。環境変数を確認してください。</p>
      </main>
    );
  }

  const { data, nextCursor } = await getInitialData(profile.id);

  return (
    <main className="mx-auto max-w-2xl w-full px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">日報</h1>
      <DailyReportsFeed
        initialData={data}
        initialNextCursor={nextCursor}
        currentProfile={{ id: profile.id, email, display_name: profile.display_name ?? null }}
      />
    </main>
  );
}
