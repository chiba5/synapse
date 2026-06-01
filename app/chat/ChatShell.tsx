'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import ChatRoom from './ChatRoom';
import { ChannelSidebar } from './ChannelSidebar';
import type { Channel, ChatPayload } from './types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function ChatShell({
  channels: initialChannels,
  initialChannelId,
  initialPayload,
  currentEmail,
  currentId,
}: {
  channels: Channel[];
  initialChannelId: string;
  initialPayload: ChatPayload;
  currentEmail: string;
  currentId: string;
}) {
  const { data: channels, mutate } = useSWR<Channel[]>('/api/chat/channels', fetcher, {
    fallbackData: initialChannels,
    refreshInterval: 15000,
  });
  const list = channels ?? initialChannels;

  const [selectedId, setSelectedId] = useState(initialChannelId);

  // restore last channel from URL (?c=) or localStorage on mount
  useEffect(() => {
    const url = new URL(window.location.href);
    const want = url.searchParams.get('c') || localStorage.getItem('synapse:lastChannel');
    if (want && initialChannels.some(c => c.id === want)) setSelectedId(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback((id: string) => {
    setSelectedId(id);
    try {
      localStorage.setItem('synapse:lastChannel', id);
      const url = new URL(window.location.href);
      url.searchParams.set('c', id);
      window.history.replaceState(null, '', url.toString());
    } catch {}
  }, []);

  const createChannel = useCallback(async (name: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/chat/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.status === 409) { toast.error('同名のチャンネルが既にあります'); return false; }
      if (!res.ok) throw new Error('create failed');
      const created: Channel = await res.json();
      await mutate();
      select(created.id);
      toast.success(`#${created.name} を作成しました`);
      return true;
    } catch {
      toast.error('チャンネルの作成に失敗しました');
      return false;
    }
  }, [mutate, select]);

  const deleteChannel = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/chat/channels/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      const next = await mutate();
      const remaining = next ?? list.filter(c => c.id !== id);
      if (id === selectedId && remaining[0]) select(remaining[0].id);
      toast.success('チャンネルを削除しました');
    } catch {
      toast.error('チャンネルの削除に失敗しました');
    }
  }, [mutate, list, selectedId, select]);

  const selected = list.find(c => c.id === selectedId) ?? list[0];

  if (!selected) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">チャンネルがありません</p>
      </main>
    );
  }

  const isInitial = selected.id === initialChannelId;

  return (
    <main className="flex flex-1 overflow-hidden">
      <ChannelSidebar
        channels={list}
        selectedId={selected.id}
        onSelect={select}
        onCreate={createChannel}
        onDelete={deleteChannel}
      />
      <ChatRoom
        key={selected.id}
        channel={selected}
        initialMessages={isInitial ? initialPayload.messages : []}
        initialReads={isInitial ? initialPayload.reads : []}
        currentEmail={currentEmail}
        currentId={currentId}
      />
    </main>
  );
}
