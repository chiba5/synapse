'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Send, Paperclip, Smile, Pencil, Trash2, Check, X, Reply, Search, Menu, Copy } from 'lucide-react';
import { ChatMarkdown } from './ChatMarkdown';
import type { Channel, Message, ChannelRead, ChatPayload, Reaction, SearchResult } from './types';

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🎉', '👀', '🔥'];

const fetcher = (url: string): Promise<ChatPayload> =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error('fetch failed');
    return r.json();
  });

const localPart = (email: string) => email.split('@')[0];

const AVATAR_GRADIENTS = [
  'from-violet-500 to-indigo-500',
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-pink-500',
  'from-amber-500 to-orange-500',
  'from-fuchsia-500 to-purple-500',
];

function Avatar({ email }: { email: string }) {
  const initials = localPart(email).slice(0, 2).toUpperCase();
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

function previewText(body: string | null, fileName: string | null) {
  if (body) return body.replace(/\n/g, ' ');
  if (fileName) return `📎 ${fileName}`;
  return 'ファイル';
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

function SheetButton({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: typeof Reply;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-3 rounded-xl text-sm active:bg-white/10 ${
        danger ? 'text-destructive' : 'text-foreground'
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

// find the @mention being typed at the caret, if any
function activeMention(text: string, caret: number) {
  const before = text.slice(0, caret);
  const m = before.match(/(?:^|\s)@([\w.\-]*)$/);
  if (!m) return null;
  return { query: m[1], start: caret - m[1].length - 1 };
}

export default function ChatRoom({
  channel,
  initialMessages,
  initialReads,
  currentEmail,
  currentId,
  onOpenNav,
}: {
  channel: Channel;
  initialMessages: Message[];
  initialReads: ChannelRead[];
  currentEmail: string;
  currentId: string;
  onOpenNav?: () => void;
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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);

  // mobile long-press action sheet
  const [sheetMsg, setSheetMsg] = useState<Message | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = useCallback((msg: Message) => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) return; // mobile only
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      setSheetMsg(msg);
      navigator.vibrate?.(10);
    }, 450);
  }, []);
  const cancelPress = useCallback(() => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }, []);

  // mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  // search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMarkedRef = useRef<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: polled } = useSWR<ChatPayload>(
    `/api/chat/messages?channel_id=${channel.id}`,
    fetcher,
    { refreshInterval: 3000, fallbackData: { messages: initialMessages, reads: initialReads } }
  );

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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }, [body]);

  // mark channel read when new messages arrive (or on mount)
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

  const otherLastRead = useMemo(() => {
    const other = reads.find(r => r.reader_id !== currentId);
    return other ? new Date(other.last_read_at).getTime() : 0;
  }, [reads, currentId]);

  const lastReadMineId = useMemo(() => {
    let id: string | null = null;
    for (const m of allMessages) {
      if (m.sender_id === currentId && new Date(m.created_at).getTime() <= otherLastRead) id = m.id;
    }
    return id;
  }, [allMessages, currentId, otherLastRead]);

  // mention candidates: distinct participant names seen in the channel
  const mentionCandidates = useMemo(() => {
    const names = new Set<string>();
    for (const m of allMessages) names.add(localPart(m.sender_email));
    for (const r of reads) names.add(localPart(r.reader_email));
    names.add(localPart(currentEmail));
    return [...names];
  }, [allMessages, reads, currentEmail]);

  const mentionMatches = useMemo(() => {
    if (mentionQuery == null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionCandidates.filter(n => n.toLowerCase().startsWith(q)).slice(0, 6);
  }, [mentionQuery, mentionCandidates]);

  const updateBody = useCallback((value: string, caret: number) => {
    setBody(value);
    const am = activeMention(value, caret);
    setMentionQuery(am ? am.query : null);
    setMentionIndex(0);
  }, []);

  const applyMention = useCallback((name: string) => {
    const el = textareaRef.current;
    const caret = el ? el.selectionStart : body.length;
    const am = activeMention(body, caret);
    if (!am) return;
    const next = body.slice(0, am.start) + '@' + name + ' ' + body.slice(caret);
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      const pos = am.start + name.length + 2;
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });
  }, [body]);

  const sendMessage = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    const replyId = replyingTo?.id ?? null;
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channel.id, body: text, reply_to: replyId }),
      });
      if (!res.ok) throw new Error('送信失敗');
      const msg: Message = await res.json();
      // attach optimistic reply preview from the message we replied to
      if (replyingTo) {
        msg.reply_preview = {
          id: replyingTo.id,
          sender_email: replyingTo.sender_email,
          body: replyingTo.body,
          file_name: replyingTo.file_name,
        };
      }
      setAllMessages(prev => [...prev, msg]);
      setBody('');
      setReplyingTo(null);
    } catch {
      toast.error('送信に失敗しました');
    } finally {
      setSending(false);
    }
  }, [body, sending, channel.id, replyingTo]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery != null && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex(i => (i + 1) % mentionMatches.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex(i => (i - 1 + mentionMatches.length) % mentionMatches.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        applyMention(mentionMatches[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as React.FormEvent);
    }
  }, [mentionQuery, mentionMatches, mentionIndex, applyMention, sendMessage]);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const replyId = replyingTo?.id ?? null;
    try {
      const fd = new FormData();
      fd.append('file', file);
      const uploadRes = await fetch('/api/chat/upload', { method: 'POST', body: fd });
      if (!uploadRes.ok) throw new Error('upload failed');
      const { file_url, file_name, file_size } = await uploadRes.json();
      const msgRes = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel_id: channel.id, file_url, file_name, file_size, reply_to: replyId }),
      });
      if (!msgRes.ok) throw new Error('message failed');
      const msg: Message = await msgRes.json();
      setAllMessages(prev => [...prev, msg]);
      setReplyingTo(null);
    } catch {
      toast.error('ファイルの送信に失敗しました');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [channel.id, replyingTo]);

  const saveEdit = useCallback(async (id: string) => {
    const text = editBody.trim();
    if (!text) return;
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
    setAllMessages(prev => prev.filter(m => m.id !== id));
    try {
      const res = await fetch(`/api/chat/messages/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
    } catch {
      toast.error('削除に失敗しました');
    }
  }, []);

  const toggleReaction = useCallback(async (id: string, emoji: string) => {
    setPickerId(null);
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

  // jump to a message in the loaded list (used by reply quote + search)
  const jumpTo = useCallback((id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) {
      toast('読み込み範囲外の古いメッセージです');
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-violet-400/70', 'rounded-2xl');
    setTimeout(() => el.classList.remove('ring-2', 'ring-violet-400/70', 'rounded-2xl'), 1800);
  }, []);

  // debounced search
  useEffect(() => {
    if (!searchOpen) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/chat/search?channel_id=${channel.id}&q=${encodeURIComponent(q)}`);
        const data: SearchResult[] = res.ok ? await res.json() : [];
        setSearchResults(data);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [searchQuery, searchOpen, channel.id]);

  const grouped = allMessages.reduce<Array<{ msg: Message; showAvatar: boolean; showDate: boolean }>>(
    (acc, msg, i) => {
      const prev = allMessages[i - 1];
      const sameGroup =
        prev &&
        prev.sender_id === msg.sender_id &&
        !msg.reply_to &&
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
      <div className="border-b border-white/10 px-4 sm:px-6 py-4 shrink-0 bg-white/5 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          {onOpenNav && (
            <button
              onClick={onOpenNav}
              className="md:hidden h-9 w-9 -ml-1 flex items-center justify-center rounded-xl text-muted-foreground hover:bg-white/10 hover:text-foreground shrink-0"
              title="チャンネル"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-linear-to-br from-violet-500 to-indigo-600 text-white font-bold shadow-lg">
            #
          </span>
          <div className="flex flex-col">
            <span className="text-base font-bold leading-tight">{channel.name}</span>
            <span className="text-[11px] text-muted-foreground leading-tight">外部脳チャンネル</span>
          </div>
          <button
            onClick={() => { setSearchOpen(v => !v); setSearchQuery(''); setSearchResults([]); }}
            className={`ml-auto h-9 w-9 flex items-center justify-center rounded-xl transition-colors ${
              searchOpen ? 'bg-violet-500/20 text-violet-300' : 'text-muted-foreground hover:bg-white/10 hover:text-foreground'
            }`}
            title="検索"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* search panel */}
      {searchOpen && (
        <div className="absolute inset-x-0 top-[73px] z-20 px-4 sm:px-6">
          <div className="mx-auto w-full max-w-3xl rounded-2xl border border-white/10 bg-popover/95 backdrop-blur-xl shadow-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
              <input
                autoFocus
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setSearchOpen(false)}
                placeholder="メッセージを検索…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <button onClick={() => setSearchOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[50vh] overflow-y-auto">
              {searching && <div className="px-3 py-4 text-xs text-muted-foreground">検索中…</div>}
              {!searching && searchQuery.trim() && searchResults.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground">一致するメッセージはありません</div>
              )}
              {searchResults.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setSearchOpen(false); jumpTo(r.id); }}
                  className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-white/5 last:border-0"
                >
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-violet-300">{localPart(r.sender_email)}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {formatDateLabel(r.created_at)} {formatTime(r.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{r.body}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 min-h-0">
        <div className="mx-auto w-full max-w-3xl space-y-1">
          {allMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-muted-foreground">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-linear-to-br from-violet-500/20 to-indigo-500/20 text-3xl">
                💬
              </div>
              <p className="text-sm font-medium">#{channel.name} へようこそ</p>
              <p className="text-xs opacity-70">最初のメッセージを送ってみましょう</p>
            </div>
          )}

          {grouped.map(({ msg, showAvatar, showDate }) => {
            const isMe = msg.sender_id === currentId;
            const name = localPart(msg.sender_email);
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

                <div
                  id={`msg-${msg.id}`}
                  onTouchStart={() => startPress(msg)}
                  onTouchMove={cancelPress}
                  onTouchEnd={cancelPress}
                  onContextMenu={e => e.preventDefault()}
                  className={`flex gap-3 ${showAvatar ? 'mt-4' : 'mt-1'} ${isMe ? 'flex-row-reverse' : ''}`}
                >
                  <div className="w-9 shrink-0">{showAvatar && <Avatar email={msg.sender_email} />}</div>

                  <div className={`group/msg flex flex-col max-w-[78%] ${isMe ? 'items-end' : 'items-start'}`}>
                    {showAvatar && !isMe && (
                      <span className="text-xs font-semibold text-muted-foreground mb-1 ml-1">{name}</span>
                    )}

                    <div className={`flex items-end gap-1.5 ${isMe ? 'flex-row-reverse' : ''}`}>
                      <div
                        className={`relative px-4 py-2.5 text-sm leading-relaxed shadow-sm transition-shadow ${
                          isMe
                            ? 'bg-linear-to-br from-violet-500 to-indigo-600 text-white rounded-2xl rounded-tr-md shadow-violet-500/25'
                            : 'bg-white/8 backdrop-blur-md border border-white/10 text-foreground rounded-2xl rounded-tl-md'
                        }`}
                      >
                        {/* quoted reply */}
                        {msg.reply_preview && (
                          <button
                            onClick={() => jumpTo(msg.reply_preview!.id)}
                            className={`block w-full text-left mb-1.5 pl-2 pr-2 py-1 rounded-md border-l-2 text-xs ${
                              isMe ? 'border-white/50 bg-black/15' : 'border-violet-400/60 bg-white/5'
                            }`}
                          >
                            <span className="font-semibold opacity-90">{localPart(msg.reply_preview.sender_email)}</span>
                            <span className="opacity-70 truncate block">
                              {previewText(msg.reply_preview.body, msg.reply_preview.file_name)}
                            </span>
                          </button>
                        )}

                        {isEditing ? (
                          <div className="flex flex-col gap-2 min-w-[200px]">
                            <textarea
                              autoFocus
                              value={editBody}
                              onChange={e => setEditBody(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(msg.id); }
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="resize-none bg-black/20 rounded-lg px-2 py-1 text-sm outline-none ring-1 ring-white/20 focus:ring-white/40"
                              rows={2}
                            />
                            <div className="flex gap-1.5 justify-end">
                              <button onClick={() => setEditingId(null)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-black/20 hover:bg-black/30">
                                <X className="h-3 w-3" /> 取消
                              </button>
                              <button onClick={() => saveEdit(msg.id)} className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-white/20 hover:bg-white/30">
                                <Check className="h-3 w-3" /> 保存
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            {msg.body && <ChatMarkdown dark={isMe}>{msg.body}</ChatMarkdown>}
                            {msg.file_url && <FileAttachment url={msg.file_url} name={msg.file_name} size={msg.file_size} />}
                            <span className={`text-[10px] mt-1 flex items-center gap-1 opacity-60 ${isMe ? 'justify-end' : 'justify-start'}`}>
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
                            onClick={() => { setReplyingTo(msg); textareaRef.current?.focus(); }}
                            className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground"
                            title="返信"
                          >
                            <Reply className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setPickerId(pickerId === msg.id ? null : msg.id)}
                            className="h-7 w-7 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground"
                            title="リアクション"
                          >
                            <Smile className="h-4 w-4" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => { setEditingId(msg.id); setEditBody(msg.body ?? ''); }}
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

                    {confirmDeleteId === msg.id && (
                      <div className="flex items-center gap-2 mt-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-destructive/10 border border-destructive/30">
                        <span>削除しますか？</span>
                        <button onClick={() => deleteMessage(msg.id)} className="px-2 py-0.5 rounded bg-destructive text-white font-medium">削除</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-0.5 rounded bg-white/10">取消</button>
                      </div>
                    )}

                    {reactionSummary.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                        {reactionSummary.map(r => (
                          <button
                            key={r.emoji}
                            onClick={() => toggleReaction(msg.id, r.emoji)}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-colors ${
                              r.mine ? 'bg-violet-500/25 border-violet-400/50' : 'bg-white/5 border-white/10 hover:bg-white/10'
                            }`}
                          >
                            <span>{r.emoji}</span>
                            <span className="opacity-80">{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

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
      </div>

      {/* composer */}
      <div className="shrink-0 px-4 sm:px-6 pb-5 pt-2">
        <div className="mx-auto w-full max-w-3xl">
          {/* reply banner */}
          {replyingTo && (
            <div className="flex items-center gap-2 mb-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs">
              <Reply className="h-3.5 w-3.5 text-violet-300 shrink-0" />
              <span className="text-violet-300 font-semibold shrink-0">{localPart(replyingTo.sender_email)}</span>
              <span className="text-muted-foreground truncate">{previewText(replyingTo.body, replyingTo.file_name)}</span>
              <button onClick={() => setReplyingTo(null)} className="ml-auto text-muted-foreground hover:text-foreground shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <form
            onSubmit={sendMessage}
            className="relative flex gap-2 items-end rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl px-3 py-2 shadow-lg focus-within:border-violet-400/50 focus-within:shadow-violet-500/10 transition-all"
          >
            {/* mention autocomplete */}
            {mentionQuery != null && mentionMatches.length > 0 && (
              <div className="absolute bottom-full left-2 mb-2 z-20 min-w-[160px] rounded-xl border border-white/15 bg-popover/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                {mentionMatches.map((n, i) => (
                  <button
                    key={n}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); applyMention(n); }}
                    className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left ${
                      i === mentionIndex ? 'bg-violet-500/25' : 'hover:bg-white/5'
                    }`}
                  >
                    <span className="text-violet-300 font-medium">@{n}</span>
                  </button>
                ))}
              </div>
            )}

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
              onChange={e => updateBody(e.target.value, e.target.selectionStart)}
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

      {/* mobile long-press action sheet */}
      {sheetMsg && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50 animate-in fade-in" onClick={() => setSheetMsg(null)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-white/10 bg-popover/95 backdrop-blur-xl p-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-200">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
            <div className="flex justify-between gap-1 px-1 pb-3 mb-2 border-b border-white/10">
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  onClick={() => { toggleReaction(sheetMsg.id, emoji); setSheetMsg(null); }}
                  className="h-11 flex-1 flex items-center justify-center rounded-xl active:bg-white/10 text-2xl active:scale-90 transition-transform"
                >
                  {emoji}
                </button>
              ))}
            </div>

            <SheetButton
              icon={Reply}
              label="返信"
              onClick={() => {
                setReplyingTo(sheetMsg);
                setSheetMsg(null);
                requestAnimationFrame(() => textareaRef.current?.focus());
              }}
            />
            {sheetMsg.body && (
              <SheetButton
                icon={Copy}
                label="コピー"
                onClick={() => {
                  navigator.clipboard?.writeText(sheetMsg.body ?? '');
                  toast.success('コピーしました');
                  setSheetMsg(null);
                }}
              />
            )}
            {sheetMsg.sender_id === currentId && sheetMsg.body && !sheetMsg.file_url && (
              <SheetButton
                icon={Pencil}
                label="編集"
                onClick={() => {
                  setEditingId(sheetMsg.id);
                  setEditBody(sheetMsg.body ?? '');
                  setSheetMsg(null);
                }}
              />
            )}
            {sheetMsg.sender_id === currentId && (
              <SheetButton
                icon={Trash2}
                label="削除"
                danger
                onClick={() => { setConfirmDeleteId(sheetMsg.id); setSheetMsg(null); }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
