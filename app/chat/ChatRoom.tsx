'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Send, Paperclip } from 'lucide-react';
import type { Channel, Message } from './types';

const fetcher = (url: string): Promise<Message[]> =>
  fetch(url).then(r => {
    if (!r.ok) throw new Error('fetch failed');
    return r.json();
  });

function Avatar({ email, size = 7 }: { email: string; size?: number }) {
  const initials = email.split('@')[0].slice(0, 2).toUpperCase();
  const colors = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-rose-500', 'bg-amber-500', 'bg-cyan-500',
  ];
  const color = colors[email.charCodeAt(0) % colors.length];
  return (
    <div className={`${color} w-${size} h-${size} rounded-full flex items-center justify-center text-white font-semibold text-xs shrink-0`}>
      {initials}
    </div>
  );
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
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
      <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1">
        <img src={url} alt={name ?? 'image'} className="max-w-[240px] max-h-[180px] rounded-lg object-cover border border-white/10" />
      </a>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-xs"
    >
      <Paperclip className="h-3 w-3 shrink-0" />
      <span className="truncate">{name ?? 'ファイル'}</span>
      {size != null && <span className="shrink-0 opacity-60">({(size / 1024).toFixed(0)} KB)</span>}
    </a>
  );
}

export default function ChatRoom({
  channel,
  initialMessages,
  currentEmail,
}: {
  channel: Channel;
  initialMessages: Message[];
  currentEmail: string;
}) {
  const [allMessages, setAllMessages] = useState<Message[]>(initialMessages);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: polled } = useSWR<Message[]>(
    `/api/chat/messages?channel_id=${channel.id}`,
    fetcher,
    { refreshInterval: 3000, fallbackData: initialMessages }
  );

  useEffect(() => {
    if (!polled) return;
    setAllMessages(prev => {
      const existingIds = new Set(prev.map(m => m.id));
      const fresh = polled.filter(m => !existingIds.has(m.id));
      return fresh.length ? [...prev, ...fresh] : prev;
    });
  }, [polled]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  // auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, [body]);

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

  // group messages: same sender within 5 min = collapsed
  const grouped = allMessages.reduce<Array<{ msg: Message; showAvatar: boolean; showDate: boolean }>>((acc, msg, i) => {
    const prev = allMessages[i - 1];
    const sameGroup =
      prev &&
      prev.sender_email === msg.sender_email &&
      new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime() < 5 * 60 * 1000;
    const diffDay = !prev || new Date(msg.created_at).toDateString() !== new Date(prev.created_at).toDateString();
    acc.push({ msg, showAvatar: !sameGroup, showDate: diffDay });
    return acc;
  }, []);

  return (
    <div className="flex flex-col flex-1 h-full min-h-0 bg-background">
      {/* チャンネルヘッダー */}
      <div className="border-b border-border/60 px-4 py-3 flex items-center gap-2 shrink-0 bg-background/80 backdrop-blur">
        <span className="text-base font-bold text-muted-foreground">#</span>
        <span className="text-base font-bold">{channel.name}</span>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-0.5 min-h-0">
        {allMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <div className="text-4xl">#</div>
            <p className="text-sm font-medium">#{channel.name} へようこそ</p>
            <p className="text-xs">最初のメッセージを送ってみましょう</p>
          </div>
        )}

        {grouped.map(({ msg, showAvatar, showDate }) => {
          const isMe = msg.sender_email === currentEmail;
          const name = msg.sender_email.split('@')[0];

          return (
            <div key={msg.id}>
              {showDate && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-xs text-muted-foreground font-medium px-2">
                    {formatDateLabel(msg.created_at)}
                  </span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
              )}

              <div className={`flex gap-3 group ${showAvatar ? 'mt-4' : 'mt-0.5'} ${isMe ? 'flex-row-reverse' : ''}`}>
                {/* avatar slot */}
                <div className="w-7 shrink-0">
                  {showAvatar && <Avatar email={msg.sender_email} />}
                </div>

                {/* bubble */}
                <div className={`flex flex-col max-w-[72%] ${isMe ? 'items-end' : 'items-start'}`}>
                  {showAvatar && !isMe && (
                    <span className="text-xs font-semibold text-muted-foreground mb-1 ml-1">{name}</span>
                  )}
                  <div
                    className={`relative px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                      isMe
                        ? 'bg-violet-600 text-white rounded-tr-md'
                        : 'bg-secondary text-secondary-foreground rounded-tl-md'
                    }`}
                  >
                    {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}
                    {msg.file_url && (
                      <FileAttachment url={msg.file_url} name={msg.file_name} size={msg.file_size} />
                    )}
                    <span className={`text-[10px] mt-1 block opacity-50 ${isMe ? 'text-right' : 'text-left'}`}>
                      {formatTime(msg.created_at)}
                    </span>
                  </div>
                </div>

                {/* my avatar */}
                <div className="w-7 shrink-0">
                  {showAvatar && isMe && <Avatar email={msg.sender_email} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <div className="shrink-0 px-4 pb-4 pt-2">
        <form
          onSubmit={sendMessage}
          className="flex gap-2 items-end rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 focus-within:border-violet-500/50 transition-colors"
        >
          <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || sending}
          >
            <Paperclip className="h-4 w-4" />
          </Button>
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 min-h-[32px] max-h-[120px] py-1 leading-relaxed"
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
            className="h-8 w-8 p-0 shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-30"
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}
