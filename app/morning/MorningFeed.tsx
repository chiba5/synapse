'use client';

import { useState } from 'react';
import type { FeedItem, Profile } from './types';

const SOURCE_LABELS: Record<FeedItem['source'], string> = {
  x: 'X',
  rss: 'RSS',
  web_search: 'Web',
};

const SOURCE_COLORS: Record<FeedItem['source'], string> = {
  x: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  rss: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  web_search: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const CATEGORY_LABELS: Record<NonNullable<FeedItem['category']>, string> = {
  practical: '実用',
  knowledge: '知識',
  claude_runnable: '試せる',
};

const CATEGORY_COLORS: Record<NonNullable<FeedItem['category']>, string> = {
  practical: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  knowledge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  claude_runnable: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
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
  const [items, setItems] = useState(initialData);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [tryingIds, setTryingIds] = useState<Set<string>>(new Set());
  const [triedIds, setTriedIds] = useState<Set<string>>(new Set());

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/morning?cursor=${encodeURIComponent(nextCursor)}&limit=20`);
      const json = await res.json();
      setItems(prev => [...prev, ...json.data]);
      setNextCursor(json.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function markRead(itemId: string) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, is_read: true } : i));
    await fetch(`/api/morning/${itemId}/read`, { method: 'POST' });
  }

  async function handleTry(itemId: string) {
    if (tryingIds.has(itemId) || triedIds.has(itemId)) return;
    setTryingIds(prev => new Set(prev).add(itemId));
    try {
      await fetch(`/api/morning/${itemId}/try`, { method: 'POST' });
      setTriedIds(prev => new Set(prev).add(itemId));
    } finally {
      setTryingIds(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  }

  return (
    <div className="space-y-3">
      {items.length === 0 && (
        <p className="text-center text-sm text-zinc-400 py-12">
          まだニュースがありません。synapse-agent を起動して収集してください。
        </p>
      )}

      {items.map(item => {
        const showUnread = !item.is_read;
        const isTrying = tryingIds.has(item.id);
        const isTried = triedIds.has(item.id);
        return (
          <div
            key={item.id}
            onClick={() => showUnread && markRead(item.id)}
            className={`rounded-xl border p-4 space-y-2.5 transition-colors ${
              showUnread
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${SOURCE_COLORS[item.source]}`}>
                  {SOURCE_LABELS[item.source]}
                </span>
                {item.category && (
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${CATEGORY_COLORS[item.category]}`}>
                    {CATEGORY_LABELS[item.category]}
                  </span>
                )}
                {showUnread && (
                  <span className="text-xs font-medium text-blue-500 dark:text-blue-400">未読</span>
                )}
              </div>
              <time className="text-xs text-zinc-400 shrink-0">
                {new Date(item.created_at).toLocaleDateString('ja-JP')}
              </time>
            </div>

            <div>
              {item.source_url ? (
                <a
                  href={item.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 hover:underline"
                >
                  {item.title}
                </a>
              ) : (
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{item.title}</p>
              )}
            </div>

            {item.summary && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                {item.summary}
              </p>
            )}

            {item.claude_runnable && (
              <div className="pt-1">
                <button
                  onClick={e => { e.stopPropagation(); handleTry(item.id); }}
                  disabled={isTrying || isTried}
                  className="text-xs px-3 py-1 rounded-md bg-zinc-900 dark:bg-zinc-100 text-zinc-50 dark:text-zinc-900 disabled:opacity-50 hover:opacity-80 transition-opacity"
                >
                  {isTried ? '試行依頼済み ✓' : isTrying ? '送信中...' : 'Claude Code で試す'}
                </button>
              </div>
            )}
          </div>
        );
      })}

      {nextCursor && (
        <button
          onClick={handleLoadMore}
          disabled={isLoadingMore}
          className="w-full py-3 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 disabled:opacity-40 transition-colors"
        >
          {isLoadingMore ? '読み込み中...' : 'もっと見る'}
        </button>
      )}
    </div>
  );
}
