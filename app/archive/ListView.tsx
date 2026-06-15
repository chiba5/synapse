'use client';

import { Button } from '@/components/ui/button';
import ArchiveItemCard from './ArchiveItemCard';
import type { ArchiveItem } from './types';

function groupByDate(items: ArchiveItem[]): Array<{ date: string; items: ArchiveItem[] }> {
  const groups: Array<{ date: string; items: ArchiveItem[] }> = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else groups.push({ date: it.date, items: [it] });
  }
  return groups;
}

function formatDateHeading(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日（${wd}）`;
}

export default function ListView({
  items, hasMore, isLoadingMore, onLoadMore, onRead,
}: {
  items: ArchiveItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRead: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-12">該当する項目がありません。</p>;
  }

  return (
    <div className="space-y-5">
      {groupByDate(items).map(group => (
        <section key={group.date} className="space-y-2">
          <h2 className="sticky top-12 z-10 -mx-4 px-4 py-1 bg-background/85 backdrop-blur-sm text-xs font-medium text-muted-foreground">
            {formatDateHeading(group.date)}
          </h2>
          {group.items.map(item => (
            <ArchiveItemCard key={`${item.type}:${item.id}`} item={item} onRead={onRead} />
          ))}
        </section>
      ))}

      {hasMore && (
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onLoadMore} disabled={isLoadingMore}>
          {isLoadingMore ? '読み込み中…' : 'もっと見る'}
        </Button>
      )}
    </div>
  );
}
