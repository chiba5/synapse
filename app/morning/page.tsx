import { redirect } from 'next/navigation';
import { getCurrentEmail } from '@/lib/user';
import { ensureProfile } from '@/lib/profiles';
import { getServiceClient } from '@/lib/supabase';
import MorningFeed from './MorningFeed';
import type { FeedItem } from './types';

export const runtime = 'edge';

const PAGE_SIZE = 20;

async function getInitialData(profileId: string) {
  try {
    const db = getServiceClient();

    const { data: rows, error } = await db
      .from('feed_items')
      .select('id, source, source_url, title, body, summary, category, claude_runnable, created_at')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (error || !rows) return { data: [] as FeedItem[], nextCursor: null };

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    const { data: reads } = await db
      .from('reads')
      .select('item_id')
      .eq('user_id', profileId)
      .eq('item_type', 'feed_item')
      .in('item_id', page.map(r => r.id));

    const readSet = new Set((reads ?? []).map(r => r.item_id));

    return {
      data: page.map(r => ({
        id: r.id as string,
        source: r.source as FeedItem['source'],
        source_url: (r.source_url ?? null) as string | null,
        title: r.title as string,
        body: (r.body ?? null) as string | null,
        summary: (r.summary ?? null) as string | null,
        category: (r.category ?? null) as FeedItem['category'],
        claude_runnable: Boolean(r.claude_runnable),
        created_at: r.created_at as string,
        is_read: readSet.has(r.id),
      })),
      nextCursor: hasMore ? (page[page.length - 1].created_at as string) : null,
    };
  } catch {
    return { data: [] as FeedItem[], nextCursor: null };
  }
}

export default async function MorningPage() {
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
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">今朝の AI ニュース</h1>
      <MorningFeed
        initialData={data}
        initialNextCursor={nextCursor}
        currentProfile={{ id: profile.id, email, display_name: profile.display_name ?? null }}
      />
    </main>
  );
}
