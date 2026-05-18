'use client';

import { useState } from 'react';
import type { Report, Profile } from './types';

export default function DailyReportsFeed({
  initialData,
  initialNextCursor,
  currentProfile,
}: {
  initialData: Report[];
  initialNextCursor: string | null;
  currentProfile: Profile;
}) {
  const [reports, setReports] = useState(initialData);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  async function reloadFirstPage() {
    const res = await fetch('/api/daily-reports?limit=20');
    const json = await res.json();
    setReports(json.data);
    setNextCursor(json.nextCursor);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/daily-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });
      if (!res.ok) return;
      setBody('');
      await reloadFirstPage();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoadMore() {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetch(`/api/daily-reports?cursor=${encodeURIComponent(nextCursor)}&limit=20`);
      const json = await res.json();
      setReports(prev => [...prev, ...json.data]);
      setNextCursor(json.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function markRead(reportId: string) {
    setReports(prev => prev.map(r => r.id === reportId ? { ...r, is_read: true } : r));
    await fetch(`/api/daily-reports/${reportId}/read`, { method: 'POST' });
  }

  const displayName = (author: Report['author']) =>
    author.display_name ?? author.email.split('@')[0];

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
      >
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="今日の日報を書く..."
          rows={3}
          className="w-full resize-none rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={!body.trim() || isSubmitting}
            className="px-4 py-1.5 text-sm font-medium rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 disabled:opacity-40 hover:opacity-80 transition-opacity"
          >
            {isSubmitting ? '投稿中...' : '投稿する'}
          </button>
        </div>
      </form>

      {reports.length === 0 && (
        <p className="text-center text-sm text-zinc-400 py-12">まだ日報がありません</p>
      )}

      {reports.map(report => {
        const isOwn = report.author.id === currentProfile.id;
        const showUnread = !report.is_read && !isOwn;
        return (
          <div
            key={report.id}
            onClick={() => showUnread && markRead(report.id)}
            className={`rounded-xl border p-4 space-y-2 transition-colors ${
              showUnread
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {displayName(report.author)}
                {isOwn && <span className="ml-1.5 text-xs text-zinc-400">（自分）</span>}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {showUnread && (
                  <span className="text-xs font-medium text-blue-500 dark:text-blue-400">未読</span>
                )}
                <time className="text-xs text-zinc-400">{report.report_date}</time>
              </div>
            </div>
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {report.body}
            </p>
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
