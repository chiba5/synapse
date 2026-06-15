import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import {
  normalizeReport, normalizeNews, normalizeNote, mergeByCreatedAtDesc, applyReadState,
  type ReportRow, type NewsRow, type NoteRow,
} from '@/lib/archive';
import ArchiveShell from './ArchiveShell';
import type { ArchiveItem, ListResponse } from './types';

export const runtime = 'edge';
const PAGE_SIZE = 20;

async function getInitial(profileId: string): Promise<ListResponse> {
  try {
    const db = getServiceClient();
    const collected: ArchiveItem[] = [];

    const [reports, notes, news] = await Promise.all([
      db.from('daily_reports')
        .select('id, report_date, body, created_at, author:profiles!daily_reports_author_id_fkey(id, email, display_name)')
        .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1),
      db.from('notes')
        .select('id, title, body, created_at, author:profiles!notes_author_id_fkey(id, email, display_name)')
        .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1),
      db.from('feed_items')
        .select('id, source, source_url, title, body, summary, category, claude_runnable, created_at')
        .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1),
    ]);

    for (const r of (reports.data ?? []) as unknown as ReportRow[]) collected.push(normalizeReport(r, false));
    for (const n of (notes.data ?? []) as unknown as NoteRow[]) collected.push(normalizeNote(n, false));
    for (const f of (news.data ?? []) as unknown as NewsRow[]) collected.push(normalizeNews(f, false));

    const merged = mergeByCreatedAtDesc(collected);
    const hasMore = merged.length > PAGE_SIZE;
    const page = hasMore ? merged.slice(0, PAGE_SIZE) : merged;

    const ids = page.map(i => i.id);
    if (ids.length) {
      const { data: reads } = await db.from('reads')
        .select('item_type, item_id').eq('user_id', profileId).in('item_id', ids)
        .in('item_type', ['daily_report', 'feed_item', 'note']);
      const readSet = new Set((reads ?? []).map(r => `${r.item_type}:${r.item_id}`));
      applyReadState(page, readSet);
    }

    return { data: page, nextCursor: hasMore ? page[page.length - 1].created_at : null };
  } catch {
    return { data: [], nextCursor: null };
  }
}

export default async function ArchivePage() {
  const auth = await getAuth().catch(() => null);
  if (!auth) redirect('/');

  const initial = await getInitial(auth.profile.id);

  return (
    <main className="mx-auto max-w-2xl w-full px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">アーカイブ</h1>
      <ArchiveShell initialList={initial} />
    </main>
  );
}
