'use client';

import { useState } from 'react';
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
  const [notes, setNotes] = useState(initialData);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  async function reloadFirstPage() {
    const res = await fetch('/api/notes?limit=20');
    const json = await res.json();
    setNotes(json.data);
    setNextCursor(json.nextCursor);
  }

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
      if (!res.ok) return;
      setTitle('');
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
      const res = await fetch(`/api/notes?cursor=${encodeURIComponent(nextCursor)}&limit=20`);
      const json = await res.json();
      setNotes(prev => [...prev, ...json.data]);
      setNextCursor(json.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function markRead(noteId: string) {
    setNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_read: true } : n));
    await fetch(`/api/notes/${noteId}/read`, { method: 'POST' });
  }

  const displayName = (author: Note['author']) =>
    author.display_name ?? author.email.split('@')[0];

  return (
    <div className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-3"
      >
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="タイトル（任意）"
          className="w-full rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500"
        />
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="本文（必須）"
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

      {notes.length === 0 && (
        <p className="text-center text-sm text-zinc-400 py-12">まだノートがありません</p>
      )}

      {notes.map(note => {
        const isOwn = note.author.id === currentProfile.id;
        const showUnread = !note.is_read && !isOwn;
        return (
          <div
            key={note.id}
            onClick={() => showUnread && markRead(note.id)}
            className={`rounded-xl border p-4 space-y-2 transition-colors ${
              showUnread
                ? 'border-blue-300 dark:border-blue-700 bg-blue-50/40 dark:bg-blue-950/20 cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950/30'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                {displayName(note.author)}
                {isOwn && <span className="ml-1.5 text-xs text-zinc-400">（自分）</span>}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {showUnread && (
                  <span className="text-xs font-medium text-blue-500 dark:text-blue-400">未読</span>
                )}
                <time className="text-xs text-zinc-400">
                  {new Date(note.created_at).toLocaleDateString('ja-JP')}
                </time>
              </div>
            </div>
            {note.title && (
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{note.title}</p>
            )}
            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
              {note.body}
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
