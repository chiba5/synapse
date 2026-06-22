'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePaginatedFeed } from '@/lib/hooks/usePaginatedFeed';
import { TweetEmbed, extractTweetId } from '@/components/TweetEmbed';
import type { FeedItem, Profile } from './types';

const SOURCE_LABELS: Record<FeedItem['source'], string> = {
  x: 'X',
  rss: 'RSS',
  web_search: 'Web',
};

const SOURCE_VARIANTS: Record<FeedItem['source'], string> = {
  x: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800',
  rss: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  web_search: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
};

const CATEGORY_LABELS: Record<NonNullable<FeedItem['category']>, string> = {
  practical: '実用',
  knowledge: '知識',
  claude_runnable: '試せる',
};

const CATEGORY_VARIANTS: Record<NonNullable<FeedItem['category']>, string> = {
  practical: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800',
  knowledge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  claude_runnable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800',
};

export default function MorningFeed({
  initialData,
  initialNextCursor,
  currentProfile: _currentProfile,
}: {
  initialData: FeedItem[];
  initialNextCursor: string | null;
  currentProfile: Profile;
}) {
  const { items, hasMore, isLoadingMore, loadMore, mutate } = usePaginatedFeed<FeedItem>(
    '/api/morning',
    initialData,
    initialNextCursor
  );
  const [tryingIds, setTryingIds] = useState<Set<string>>(new Set());
  const [triedIds, setTriedIds] = useState<Set<string>>(new Set());

  async function markRead(itemId: string) {
    mutate(
      pages => pages?.map(p => ({
        ...p,
        data: p.data.map((i: FeedItem) => i.id === itemId ? { ...i, is_read: true } : i),
      })),
      { revalidate: false }
    );
    await fetch(`/api/morning/${itemId}/read`, { method: 'POST' });
  }

  async function handleTry(itemId: string) {
    if (tryingIds.has(itemId) || triedIds.has(itemId)) return;
    setTryingIds(prev => new Set(prev).add(itemId));
    try {
      const res = await fetch(`/api/morning/${itemId}/try`, { method: 'POST' });
      if (res.ok) {
        setTriedIds(prev => new Set(prev).add(itemId));
        toast.success('Claude Code に試行を依頼しました');
      } else {
        toast.error('依頼に失敗しました');
      }
    } finally {
      setTryingIds(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">
          まだニュースがありません。synapse-agent を起動して収集してください。
        </p>
      )}

      {items.map(item => {
        const showUnread = !item.is_read;
        const isTrying = tryingIds.has(item.id);
        const isTried = triedIds.has(item.id);
        return (
          <Card
            key={item.id}
            onClick={() => showUnread && markRead(item.id)}
            className={showUnread
              ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors'
              : 'transition-colors'}
          >
            <CardContent className="pt-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${SOURCE_VARIANTS[item.source]}`}>
                    {SOURCE_LABELS[item.source]}
                  </span>
                  {item.category && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${CATEGORY_VARIANTS[item.category]}`}>
                      {CATEGORY_LABELS[item.category]}
                    </span>
                  )}
                  {item.topic && (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-sky-200 dark:border-sky-800">
                      {item.topic}
                    </span>
                  )}
                  {showUnread && <Badge className="text-xs bg-blue-500 hover:bg-blue-500">未読</Badge>}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-muted-foreground shrink-0 tabular-nums" title="関心度スコア">
                    ★{item.score}
                  </span>
                  <time className="text-xs text-muted-foreground shrink-0">
                    {new Date(item.created_at).toLocaleDateString('ja-JP')}
                  </time>
                </div>
              </div>

              {item.source === 'x' && item.source_url && extractTweetId(item.source_url) ? (
                <div onClick={e => e.stopPropagation()}>
                  <TweetEmbed url={item.source_url} />
                </div>
              ) : (
                <>
                  <div>
                    {item.source_url && /^https?:\/\//.test(item.source_url) ? (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-sm font-semibold hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <p className="text-sm font-semibold">{item.title}</p>
                    )}
                  </div>

                  {item.summary && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.summary}</p>
                  )}
                </>
              )}

              {item.claude_runnable && (
                <div className="pt-0.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={e => { e.stopPropagation(); handleTry(item.id); }}
                    disabled={isTrying || isTried}
                    className="text-xs h-7"
                  >
                    {isTried ? '試行依頼済み ✓' : isTrying ? '送信中…' : 'Claude Code で試す'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {hasMore && (
        <Button
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={loadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? '読み込み中…' : 'もっと見る'}
        </Button>
      )}
    </div>
  );
}
