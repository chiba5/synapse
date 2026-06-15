'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownBody } from '@/components/MarkdownBody';
import type { ArchiveItem } from './types';

const TYPE_LABEL: Record<ArchiveItem['type'], string> = {
  report: '日報', news: 'ニュース', note: 'ノート',
};
const TYPE_ACCENT: Record<ArchiveItem['type'], string> = {
  report: 'bg-blue-500', news: 'bg-violet-500', note: 'bg-emerald-500',
};
const CATEGORY_LABEL: Record<NonNullable<ArchiveItem['category']>, string> = {
  practical: '実用', knowledge: '知識', claude_runnable: '試せる',
};

const READ_ENDPOINT: Record<ArchiveItem['type'], (id: string) => string> = {
  report: id => `/api/daily-reports/${id}/read`,
  note: id => `/api/notes/${id}/read`,
  news: id => `/api/morning/${id}/read`,
};

export default function ArchiveItemCard({
  item, onRead,
}: {
  item: ArchiveItem;
  onRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  async function markRead() {
    if (item.is_read) return;
    onRead(item.id); // optimistic（親が状態更新）
    await fetch(READ_ENDPOINT[item.type](item.id), { method: 'POST' }).catch(() => {});
  }

  async function handleClick() {
    void markRead();
    if (item.type === 'news') {
      if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    // report / note: インライン展開トグル
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (body === null && !loadingBody) {
      setLoadingBody(true);
      try {
        const res = await fetch(`/api/archive/item?type=${item.type}&id=${item.id}`);
        const json = (await res.json()) as { body: string };
        setBody(json.body ?? item.excerpt);
      } catch {
        setBody(item.excerpt);
      } finally {
        setLoadingBody(false);
      }
    }
  }

  const showUnread = !item.is_read;

  return (
    <Card
      onClick={handleClick}
      className={
        'cursor-pointer transition-colors ' +
        (showUnread ? 'border-primary/40 bg-primary/5 hover:bg-primary/10' : 'hover:bg-secondary/40')
      }
    >
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-block h-2 w-2 rounded-full ${TYPE_ACCENT[item.type]}`} />
          <span className="text-xs text-muted-foreground">{TYPE_LABEL[item.type]}</span>
          {item.category && (
            <span className="text-xs text-muted-foreground">· {CATEGORY_LABEL[item.category]}</span>
          )}
          {showUnread && <Badge className="text-xs">未読</Badge>}
          <time className="ml-auto text-xs text-muted-foreground">
            {new Date(item.created_at).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>

        <p className="text-sm font-semibold">{item.title}</p>

        {expanded && (item.type === 'report' || item.type === 'note') ? (
          loadingBody ? (
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          ) : (
            <MarkdownBody>{body ?? item.excerpt}</MarkdownBody>
          )
        ) : (
          item.excerpt && <p className="text-sm text-muted-foreground leading-relaxed">{item.excerpt}</p>
        )}

        {item.author && (
          <p className="text-xs text-muted-foreground">
            {item.author.display_name ?? item.author.email}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
