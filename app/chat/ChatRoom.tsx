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

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      {/* チャンネルヘッダー */}
      <div className="border-b px-4 py-2.5 flex items-center gap-2 shrink-0">
        <span className="text-sm font-semibold text-muted-foreground">#</span>
        <span className="text-sm font-semibold">{channel.name}</span>
      </div>

      {/* メッセージ一覧 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {allMessages.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">
            まだメッセージがありません。最初のメッセージを送ってみましょう！
          </p>
        )}
        {allMessages.map(msg => {
          const isMe = msg.sender_email === currentEmail;
          return (
            <div key={msg.id} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm ${
                  isMe
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-secondary text-secondary-foreground rounded-tl-sm'
                }`}
              >
                {!isMe && (
                  <p className="text-xs font-medium mb-0.5 opacity-60">
                    {msg.sender_email.split('@')[0]}
                  </p>
                )}
                {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}
                {msg.file_url && (
                  <a
                    href={msg.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-xs mt-1 block"
                  >
                    📎 {msg.file_name ?? 'ファイル'}
                    {msg.file_size != null && ` (${(msg.file_size / 1024 / 1024).toFixed(1)} MB)`}
                  </a>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* 入力欄 */}
      <form onSubmit={sendMessage} className="border-t p-3 flex gap-2 items-end shrink-0">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-10 px-2 shrink-0"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || sending}
        >
          <Paperclip className="h-4 w-4" />
        </Button>
        <textarea
          className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring min-h-[40px] max-h-[120px]"
          placeholder="メッセージを入力… (Enter で送信 / Shift+Enter で改行)"
          value={body}
          onChange={e => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
          rows={1}
        />
        <Button
          type="submit"
          disabled={!body.trim() || sending}
          size="sm"
          className="h-10 px-3"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
