import { redirect } from 'next/navigation';
import { getCurrentEmail } from '@/lib/user';
import { ensureProfile } from '@/lib/profiles';
import { getServiceClient } from '@/lib/supabase';
import NotesFeed from './NotesFeed';
import type { Note } from './types';

export const runtime = 'edge';

const PAGE_SIZE = 20;

async function getInitialData(profileId: string) {
  try {
    const db = getServiceClient();

    const { data: rows, error } = await db
      .from('notes')
      .select('id, title, body, created_at, updated_at, author:profiles!author_id(id, email, display_name)')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (error || !rows) return { data: [] as Note[], nextCursor: null };

    const hasMore = rows.length > PAGE_SIZE;
    const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

    const { data: reads } = await db
      .from('reads')
      .select('item_id')
      .eq('user_id', profileId)
      .eq('item_type', 'note')
      .in('item_id', page.map(n => n.id));

    const readSet = new Set((reads ?? []).map(r => r.item_id));

    return {
      data: page.map(n => {
        const author = Array.isArray(n.author) ? n.author[0] : n.author;
        return {
          id: n.id as string,
          title: (n.title ?? null) as string | null,
          body: n.body as string,
          created_at: n.created_at as string,
          is_read: readSet.has(n.id),
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
    return { data: [] as Note[], nextCursor: null };
  }
}

export default async function NotesPage() {
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
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-6">ノート</h1>
      <NotesFeed
        initialData={data}
        initialNextCursor={nextCursor}
        currentProfile={{ id: profile.id, email, display_name: profile.display_name ?? null }}
      />
    </main>
  );
}
