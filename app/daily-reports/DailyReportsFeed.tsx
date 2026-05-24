'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownBody } from '@/components/MarkdownBody';
import { usePaginatedFeed } from '@/lib/hooks/usePaginatedFeed';
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
  const { items: reports, hasMore, isLoadingMore, loadMore, mutate } = usePaginatedFeed<Report>(
    '/api/daily-reports',
    initialData,
    initialNextCursor
  );
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      if (!res.ok) { toast.error('投稿に失敗しました'); return; }
      setBody('');
      toast.success('日報を投稿しました');
      mutate();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markRead(reportId: string) {
    mutate(
      pages => pages?.map(p => ({
        ...p,
        data: p.data.map((r: Report) => r.id === reportId ? { ...r, is_read: true } : r),
      })),
      { revalidate: false }
    );
    await fetch(`/api/daily-reports/${reportId}/read`, { method: 'POST' });
  }

  const displayName = (author: Report['author']) =>
    author.display_name ?? author.email.split('@')[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e); }}
              placeholder="今日の日報を書く… (Markdown 対応、⌘+Enter で投稿)"
              rows={3}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!body.trim() || isSubmitting}>
                {isSubmitting ? '投稿中…' : '投稿する'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {reports.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">まだ日報がありません</p>
      )}

      {reports.map(report => {
        const isOwn = report.author.id === currentProfile.id;
        const showUnread = !report.is_read && !isOwn;
        return (
          <Card
            key={report.id}
            onClick={() => showUnread && markRead(report.id)}
            className={showUnread
              ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors'
              : 'transition-colors'}
          >
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {displayName(report.author)}
                  </span>
                  {isOwn && <Badge variant="secondary" className="text-xs">自分</Badge>}
                  {showUnread && <Badge className="text-xs bg-blue-500 hover:bg-blue-500">未読</Badge>}
                </div>
                <time className="text-xs text-muted-foreground shrink-0">{report.report_date}</time>
              </div>
              <MarkdownBody>{report.body}</MarkdownBody>
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
