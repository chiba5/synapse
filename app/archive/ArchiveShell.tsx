'use client';

import { useEffect, useRef, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import ListView from './ListView';
import CalendarView from './CalendarView';
import type { ArchiveItem, ArchiveType, ListResponse } from './types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const TYPE_CHIPS: Array<{ value: 'all' | ArchiveType; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'report', label: '日報' },
  { value: 'news', label: 'ニュース' },
  { value: 'note', label: 'ノート' },
];
const CATEGORY_CHIPS: Array<{ value: string; label: string }> = [
  { value: 'practical', label: '実用' },
  { value: 'knowledge', label: '知識' },
  { value: 'claude_runnable', label: '試せる' },
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ArchiveShell({ initialList }: { initialList: ListResponse }) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [type, setType] = useState<'all' | ArchiveType>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [rawQ, setRawQ] = useState('');
  const [q, setQ] = useState('');

  // localStorage から view 復元
  useEffect(() => {
    const saved = localStorage.getItem('archive-view');
    if (saved === 'list' || saved === 'calendar') setView(saved);
  }, []);
  useEffect(() => { localStorage.setItem('archive-view', view); }, [view]);

  // 検索 debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQ(rawQ.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawQ]);

  // category は一覧モード かつ all/news のときだけ有効
  const categoryActive = view === 'list' && (type === 'all' || type === 'news');
  const effectiveCategory = categoryActive ? category : null;

  const buildParams = (cursor?: string) => {
    const p = new URLSearchParams({ view: 'list', type, limit: '20' });
    if (cursor) p.set('cursor', cursor);
    if (q) p.set('q', q);
    if (effectiveCategory) p.set('category', effectiveCategory);
    return p.toString();
  };

  const getKey = (index: number, prev: ListResponse | null) => {
    if (prev && !prev.nextCursor) return null;
    if (index === 0) return `/api/archive?${buildParams()}`;
    return `/api/archive?${buildParams(prev!.nextCursor!)}`;
  };

  const { data: pages, size, setSize, mutate, isValidating } = useSWRInfinite<ListResponse>(
    getKey, fetcher,
    {
      fallbackData: q === '' && type === 'all' && !effectiveCategory ? [initialList] : undefined,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    },
  );

  const items = pages?.flatMap(p => p.data) ?? [];
  const hasMore = pages ? !!pages[pages.length - 1]?.nextCursor : !!initialList.nextCursor;
  const isLoadingMore = isValidating && size > (pages?.length ?? 0);

  function markReadLocal(id: string) {
    mutate(
      ps => ps?.map(p => ({ ...p, data: p.data.map((i: ArchiveItem) => (i.id === id ? { ...i, is_read: true } : i)) })),
      { revalidate: false },
    );
  }

  return (
    <div className="space-y-4">
      {/* タイプチップ + ビュー切替 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {TYPE_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => setType(chip.value)}
              className={
                'px-2.5 py-1 rounded-full text-xs transition-colors ' +
                (type === chip.value ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-secondary/60')
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setView('list')} className={'px-2 py-1 rounded-md text-xs ' + (view === 'list' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>≣ 一覧</button>
          <button onClick={() => setView('calendar')} className={'px-2 py-1 rounded-md text-xs ' + (view === 'calendar' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>▦ 暦</button>
        </div>
      </div>

      {/* category（一覧 かつ all/news のみ） */}
      {categoryActive && (
        <div className="flex gap-1 flex-wrap">
          {CATEGORY_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => setCategory(c => (c === chip.value ? null : chip.value))}
              className={
                'px-2 py-0.5 rounded-full text-xs transition-colors ' +
                (category === chip.value ? 'bg-violet-500 text-white' : 'border border-border text-muted-foreground hover:bg-secondary/60')
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* 検索 */}
      <input
        value={rawQ}
        onChange={e => setRawQ(e.target.value)}
        placeholder="🔍 全部から検索…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      {view === 'list' ? (
        <ListView
          items={items}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={() => setSize(s => s + 1)}
          onRead={markReadLocal}
        />
      ) : (
        <CalendarView initialMonth={currentMonth()} type={type} onRead={markReadLocal} />
      )}
    </div>
  );
}
