'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownBody } from '@/components/MarkdownBody';
import { usePaginatedFeed } from '@/lib/hooks/usePaginatedFeed';
import type { Note, Profile } from './types';

export default function NotesFeed({
  initialData,
  initialNextCursor,
  currentProfile,
}: {
  initialData: Note[];
  initialNextCursor: string | null;
  currentProfile: Profile;
}) {
  const { items: notes, hasMore, isLoadingMore, loadMore, mutate } = usePaginatedFeed<Note>(
    '/api/notes',
    initialData,
    initialNextCursor
  );
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || null, body: body.trim() }),
      });
      if (!res.ok) { toast.error('投稿に失敗しました'); return; }
      setTitle('');
      setBody('');
      toast.success('ノートを投稿しました');
      mutate();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function markRead(noteId: string) {
    mutate(
      pages => pages?.map(p => ({
        ...p,
        data: p.data.map((n: Note) => n.id === noteId ? { ...n, is_read: true } : n),
      })),
      { revalidate: false }
    );
    await fetch(`/api/notes/${noteId}/read`, { method: 'POST' });
  }

  const displayName = (author: Note['author']) =>
    author.display_name ?? author.email.split('@')[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="タイトル（任意）"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e); }}
              placeholder="本文（必須）… Markdown 対応、⌘+Enter で投稿"
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

      {notes.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-12">まだノートがありません</p>
      )}

      {notes.map(note => {
        const isOwn = note.author.id === currentProfile.id;
        const showUnread = !note.is_read && !isOwn;
        return (
          <Card
            key={note.id}
            onClick={() => showUnread && markRead(note.id)}
            className={showUnread
              ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50/60 dark:hover:bg-blue-950/30 transition-colors'
              : 'transition-colors'}
          >
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{displayName(note.author)}</span>
                  {isOwn && <Badge variant="secondary" className="text-xs">自分</Badge>}
                  {showUnread && <Badge className="text-xs bg-blue-500 hover:bg-blue-500">未読</Badge>}
                </div>
                <time className="text-xs text-muted-foreground shrink-0">
                  {new Date(note.created_at).toLocaleDateString('ja-JP')}
                </time>
              </div>
              {note.title && (
                <p className="text-sm font-semibold">{note.title}</p>
              )}
              <MarkdownBody>{note.body}</MarkdownBody>
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
