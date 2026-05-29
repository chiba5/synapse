'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Smile, Pencil, Trash2, Check, X } from 'lucide-react';
import type { Channel, Message, ChannelRead, ChatPayload, Reaction } from './types';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🔥'];

const fetcher = (url: string): Promise<ChatPayload> =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error('fetch failed');
    return r.json();
  });

// Stable gradient pair per email
const AVATAR_GRADIENTS = [
  'from-violet-500 to-indigo-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-pink-500',
  'from-amber-500 to-orange-500',
  'from-fuchsia-500 to-purple-500',
];

function Avatar({ email }: { email: string }) {
  const initials = email.split('@')[0].slice(0, 2).toUpperCase();
  const gradient = AVATAR_GRADIENTS[email.charCodeAt(0) % AVATAR_GRADIENTS.length];
  return (
    <div
      className={`bg-linear-to-br ${gradient} h-9 w-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-lg ring-2 ring-white/10`}
    >
      {initials}
    </div>
  );
}

function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(ts: string) {
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return '今日';
  if (d.toDateString() === yesterday.toDateString()) return '昨日';
  return d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' });
}

function FileAttachment({ url, name, size }: { url: string; name: string | null; size: number | null }) {
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(name ?? '');
  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name ?? 'image'}
          className="max-w-[260px] max-h-[200px] rounded-xl object-cover border border-white/15 shadow-md"
        />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1.5 px-3 py-2 rounded-xl bg-black/20 hover:bg-black/30 transition-colors text-xs"
    >
      <Paperclip className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{name ?? 'ファイル'}</span>
      {size != null && <span className="shrink-0 opacity-60">({(size / 1024).toFixed(0)} KB)</span>}
    </a>
  );
}

// Collapse a message's reactions into emoji → {count, mine}
function summarizeReactions(reactions: Reaction[], currentId: string) {
  const map = new Map<string, { count: number; mine: boolean }>();
  for (const r of reactions) {
    const e = map.get(r.emoji) ?? { count: 0, mine: false };
    e.count += 1;
    if (r.reader_id === currentId) e.mine = true;
    map.set(r.emoji, e);
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }));
}

export default function ChatRoom({
  channel,
  initialMessages,
  initialReads,
  currentEmail,
  currentId,
}: {
  channel: Channel;
  initialMessages: Message[];
  initialReads: ChannelRead[];
  currentEmail: string;
  currentId: string;
}) {
  const [allMessages, setAllMessages] = useState<Message[]>(initialMessages);
  const [reads, setReads] = useState<ChannelRead[]>(initialReads);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pickerId, setPickerId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMarkedRef = useRef<string | null>(null);

  const { data: polled } = useSWR<ChatPayload>(
    `/api/chat/messages?channel_id=${channel.id}`,
    fetcher,
    { refreshInterval: 3000, fallbackData: { messages: initialMessages, reads: initialReads } }
  );

  // Merge polled data: replace messages wholesale (covers edits, deletes,
  // reactions) but keep locally-sent optimistic ones that haven't synced yet.
  useEffect(() => {
    if (!polled) return;
    setAllMessages(prev => {
      const polledIds = new Set(polled.messages.map(m => m.id));
      const optimistic = prev.filter(m => !polledIds.has(m.id) && m.id.startsWith('tmp-'));
      return [...polled.messages, ...optimistic];
    });
    setReads(polled.reads);
  }, [polled]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages.length]);

  // auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [body]);

  // Mark channel read when new messages from others arrive (or on mount)
  useEffect(() => {
    if (allMessages.length === 0) return;
    const latest = allMessages[allMessages.length - 1];
    if (lastMarkedRef.current === latest.id) return;
    lastMarkedRef.current = latest.id;
    fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel_id: channel.id }),
    }).catch(() => {});
  }, [allMessages, channel.id]);

  // The other participant's last_read_at (2-person chat)
  const otherLastRead = useMemo(() => {
    const other = reads.find(r => r.reader_id !== currentId);
    return other ? new Date(other.last_read_at).getTime() : 0;
  }, [reads, currentId]);

  // id of the newest of MY messages that the other party has read
  const lastReadMineId = useMemo(() => {
    let id: string | null = null;
    for (const m of allMessages) {
      if (m.sender_id === currentId && new Date(m.created_at).getTime() <= otherLastRead) {
        id = m.id;
      }
    }
    return id;
  }, [allMessages, currentId, otherLastRead]);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channel.id, body: text }),
      });
      if (!res.ok) throw new Error('送信失敗');
      const msg: Message = await res.json();
      setAllMessages(prev => [...prev, msg]);
      setBody('');
    } catch {
      toast.error('送信に失敗しました');
    } finally {
      setSending(false);
    }
  }, [body, sending, channel.id]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as React.FormEvent);
    }
  }, [sendMessage]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch('/api/chat/upload', { method: 'POST', body: fd });
      if (!uploadRes.ok) throw new Error('upload failed');
      const { file_url, file_name, file_size } = await uploadRes.json();
      const msgRes = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channel.id, file_url, file_name, file_size }),
      });
      if (!msgRes.ok) throw new Error('message failed');
      const msg: Message = await msgRes.json();
      setAllMessages(prev => [...prev, msg]);
    } catch {
      toast.error('ファイルの送信に失敗しました');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [channel.id]);

  const saveEdit = useCallback(async (id: string) => {
    const text = editBody.trim();
    if (!text) return;
    // optimistic
    setAllMessages(prev =>
      prev.map(m => (m.id === id ? { ...m, body: text, edited_at: new Date().toISOString() } : m))
    );
    setEditingId(null);
    try {
      const res = await fetch(`/api/chat/messages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) throw new Error('edit failed');
    } catch {
      toast.error('編集に失敗しました');
    }
  }, [editBody]);

  const deleteMessage = useCallback(async (id: string) => {
    setConfirmDeleteId(null);
    setAllMessages(prev => prev.filter(m => m.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/chat/messages/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      toast.error('削除に失敗しました');
    }
  }, []);

  const toggleReaction = useCallback(async (id: string, emoji: string) => {
    setPickerId(null);
    // optimistic toggle
    setAllMessages(prev =>
      prev.map(m => {
        if (m.id !== id) return m;
        const mine = m.reactions.find(r => r.emoji === emoji && r.reader_id === currentId);
        const reactions = mine
          ? m.reactions.filter(r => !(r.emoji === emoji && r.reader_id === currentId))
          : [...m.reactions, { emoji, reader_id: currentId, reader_email: currentEmail }];
        return { ...m, reactions };
      })
    );
    try {
      const res = await fetch(`/api/chat/messages/${id}/reaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error('reaction failed');
    } catch {
      toast.error('リアクションに失敗しました');
    }
  }, [currentId, currentEmail]);

  // group messages: same sender within 5 min = collapsed
  const grouped = allMessages.reduce<Array<{ msg: Message; showAvatar: boolean; showDate: boolean }>>(
    (acc, msg, i) => {
      const prev = allMessages[i - 1];
      const sameGroup =
        prev &&
        prev.sender_id === msg.sender_id &&
        new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
      const diffDay =
        !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
      acc.push({ msg, showAvatar: !sameGroup, showDate: diffDay });
      return acc;
    },
    []
  );

  return (
    <div className="relative flex flex-col flex-1 h-full min-h-0 overflow-hidden">
      {/* ambient gradient backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-linear-to-b from-violet-600/10 via-background to-background" />
      <div className="pointer-events-none absolute -top-24 left-1/3 -z-10 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 right-0 -z-10 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />

      {/* channel header */}
      <div className="border-b border-white/10 px-6 sm:px-8 py-4 flex items-center gap-3 shrink-0 bg-white/5 backdrop-blur-xl">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-indigo-600 text-white font-bold shadow-lg">
          #
        </span>
        <div className="flex flex-col">
          <span className="text-base font-bold leading-tight">{channel.name}</span>
          <span className="text-[11px] text-muted-foreground leading-tight">外部脳チャンネル</span>
        </div>
      </div>

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-6 space-y-1 min-h-0">
        {allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500/20 to-indigo-500/20 text-3xl">
              💬
            </div>
            <p className="text-sm font-medium">#{channel.name} へようこそ</p>
            <p className="text-xs opacity-70">最初のメッセージを送ってみましょう</p>
          </div>
        )}

        {grouped.map(({ msg, showAvatar, showDate }) => {
          const isMe = msg.sender_id === currentId;
          const name = msg.sender_email.split('@')[0];
          const isEditing = editingId === msg.id;
          const reactionSummary = summarizeReactions(msg.reactions, currentId);
          const isLastReadMine = isMe && msg.id === lastReadMineId;
          const canEdit = isMe && !!msg.body && !msg.file_url;

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[11px] font-medium px-3 py-1 rounded-full bg-white/5 backdrop-blur border border-white/10 text-muted-foreground">
                    {formatDateLabel(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>
              )}

              <div className={`flex gap-3 ${showAvatar ? 'mt-4' : 'mt-1'} ${isMe ? 'flex-row-reverse' : ''}`}>
                {/* avatar slot */}
                <div className="w-9 shrink-0">{showAvatar && <Avatar email={msg.sender_email} />}</div>

                {/* bubble column */}
                <div className={`group/msg flex flex-col max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {showAvatar && !isMe && (
                    <span className="text-xs font-semibold text-muted-foreground mb-1 ml-1">{name}</span>
                  )}

                  <div className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                    {/* the bubble */}
                    <div
                      className={`relative px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-shadow ${
                        isMe
                          ? 'bg-linear-to-br from-violet-500 to-indigo-600 text-white rounded-2xl rounded-tr-md shadow-violet-500/25'
                          : 'bg-white/8 backdrop-blur-md border border-white/10 text-foreground rounded-2xl rounded-tl-md'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <textarea
                            autoFocus
                            value={editBody}
                            onChange={e => setEditBody(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                saveEdit(msg.id);
                              }
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="resize-none bg-black/20 rounded-lg px-2 py-1 text-sm outline-none ring-1 ring-white/20 focus:ring-white/40"
                            rows={2}
                          />
                          <div className="flex gap-1.5 justify-end">
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-black/20 hover:bg-black/30"
                            >
                              <X className="h-3 w-3" /> 取消
                            </button>
                            <button
                              onClick={() => saveEdit(msg.id)}
                              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/20 hover:bg-white/30"
                            >
                              <Check className="h-3 w-3" /> 保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {msg.body && (
                            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{msg.body}</p>
                          )}
                          {msg.file_url && (
                            <FileAttachment url={msg.file_url} name={msg.file_name} size={msg.file_size} />
                          )}
                          <span
                            className={`text-[10px] mt-1 flex items-center gap-1 opacity-60 ${
                              isMe ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {msg.edited_at && <span>編集済み</span>}
                            {formatTime(msg.created_at)}
                          </span>
                        </>
                      )}
                    </div>

                    {/* hover action bar */}
                    {!isEditing && (
                      <div className="relative flex items-center gap-0.5 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                        <button
                          onClick={() => setPickerId(pickerId === msg.id ? null : msg.id)}
                          className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground"
                          title="リアクション"
                        >
                          <Smile className="h-4 w-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => {
                              setEditingId(msg.id);
                              setEditBody(msg.body ?? '');
                            }}
                            className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground"
                            title="編集"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {isMe && (
                          <button
                            onClick={() => setConfirmDeleteId(msg.id)}
                            className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-destructive/20 text-muted-foreground hover:text-destructive"
                            title="削除"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}

                        {/* emoji picker */}
                        {pickerId === msg.id && (
                          <div className="absolute bottom-9 right-0 z-10 flex gap-1 p-1.5 rounded-full bg-popover border border-white/15 shadow-xl backdrop-blur-xl">
                            {QUICK_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => toggleReaction(msg.id, emoji)}
                                className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-lg transition-transform hover:scale-125"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* delete confirm */}
                  {confirmDeleteId === msg.id && (
                    <div className="flex items-center gap-2 mt-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30">
                      <span>削除しますか？</span>
                      <button
                        onClick={() => deleteMessage(msg.id)}
                        className="px-2 py-0.5 rounded bg-destructive text-white font-medium"
                      >
                        削除
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-0.5 rounded bg-white/10"
                      >
                        取消
                      </button>
                    </div>
                  )}

                  {/* reactions */}
                  {reactionSummary.length > 0 && (
                    <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      {reactionSummary.map(r => (
                        <button
                          key={r.emoji}
                          onClick={() => toggleReaction(msg.id, r.emoji)}
                          className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                            r.mine
                              ? 'bg-violet-500/25 border-violet-400/50'
                              : 'bg-white/5 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          <span>{r.emoji}</span>
                          <span className="opacity-80">{r.count}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* read receipt on my newest read message */}
                  {isLastReadMine && (
                    <span className="text-[10px] text-violet-400 mt-1 flex items-center gap-0.5">
                      <Check className="h-3 w-3 -mr-1.5" />
                      <Check className="h-3 w-3" />
                      既読 {otherLastRead ? formatTime(new Date(otherLastRead).toISOString()) : ''}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <div className="shrink-0 px-6 sm:px-8 pb-5 pt-2">
        <form
          onSubmit={sendMessage}
          className="flex gap-2 items-end rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-3 py-2 shadow-lg focus-within:border-violet-400/50 focus-within:shadow-violet-500/10 transition-all"
        >
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 shrink-0 rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/10"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-h-[36px] max-h-[140px] py-1.5 leading-relaxed"
            placeholder={uploading ? 'アップロード中…' : `#${channel.name} へメッセージ`}
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={sending || uploading}
            rows={1}
          />
          <Button
            type="submit"
            disabled={!body.trim() || sending}
            size="sm"
            className="h-9 w-9 p-0 shrink-0 rounded-xl bg-linear-to-br from-violet-500 to-indigo-600 hover:from-violet-400 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/25 disabled:opacity-30 disabled:shadow-none"
          >
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
