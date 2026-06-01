'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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
  const [navOpen, setNavOpen] = useState(false);

  // mobile peek-drawer drag state (Discord-style swipe)
  const SIDEBAR_W = 288; // matches w-72
  const [dragX, setDragX] = useState<number | null>(null);
  const dragging = dragX !== null;
  const touch = useRef({ x: 0, y: 0, lock: '' as '' | 'h' | 'v', startTx: 0, moved: 0 });

  const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (!isMobile()) return;
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY, lock: '', startTx: navOpen ? SIDEBAR_W : 0, moved: 0 };
  }, [navOpen]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isMobile()) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current.moved = Math.max(touch.current.moved, Math.abs(dx) + Math.abs(dy));
    if (touch.current.lock === '' && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      touch.current.lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    }
    if (touch.current.lock === 'h') {
      setDragX(Math.max(0, Math.min(SIDEBAR_W, touch.current.startTx + dx)));
    }
  }, []);

  // keep latest dragX readable inside the touchend handler without re-creating it
  const dragXRef = useRef<number | null>(null);
  dragXRef.current = dragX;

  const onTouchEnd = useCallback(() => {
    if (!isMobile()) return;
    const { lock, moved } = touch.current;
    if (lock === 'h') {
      const tx = dragXRef.current ?? (navOpen ? SIDEBAR_W : 0);
      setNavOpen(tx > SIDEBAR_W / 2);
      setDragX(null);
    } else if (navOpen && moved < 10) {
      setNavOpen(false); // tap on the peeking chat closes the drawer
    }
  }, [navOpen]);

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

  const renameChannel = useCallback(async (id: string, name: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/chat/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.status === 409) { toast.error('同名のチャンネルが既にあります'); return false; }
      if (res.status === 403) { toast.error('#general は名前を変更できません'); return false; }
      if (!res.ok) throw new Error('rename failed');
      const updated: Channel = await res.json();
      await mutate();
      toast.success(`#${updated.name} に変更しました`);
      return true;
    } catch {
      toast.error('チャンネル名の変更に失敗しました');
      return false;
    }
  }, [mutate]);

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

  const sidebarProps = {
    channels: list,
    selectedId: selected.id,
    onSelect: select,
    onCreate: createChannel,
    onRename: renameChannel,
    onDelete: deleteChannel,
  };

  const tx = dragX !== null ? dragX : navOpen ? SIDEBAR_W : 0;

  return (
    <main className="relative flex flex-1 overflow-hidden">
      {/* desktop: persistent sidebar (hidden on mobile, part of the flex row) */}
      <ChannelSidebar {...sidebarProps} />

      {/* mobile: sidebar sits underneath, revealed when the chat slides right (Discord peek) */}
      <div className="md:hidden absolute inset-y-0 left-0 w-72 z-10">
        <ChannelSidebar mobile onClose={() => setNavOpen(false)} {...sidebarProps} />
      </div>

      {/* chat panel — overlays the sidebar on mobile and slides to reveal it */}
      <div
        className="flex-1 min-w-0 bg-background max-md:absolute max-md:inset-0 max-md:z-20 max-md:touch-pan-y max-md:shadow-2xl"
        style={{ transform: `translateX(${tx}px)`, transition: dragging ? 'none' : 'transform 0.22s ease' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className={`flex flex-col h-full ${navOpen ? 'max-md:pointer-events-none' : ''}`}>
          <ChatRoom
            key={selected.id}
            channel={selected}
            onOpenNav={() => setNavOpen(true)}
            initialMessages={isInitial ? initialPayload.messages : []}
            initialReads={isInitial ? initialPayload.reads : []}
            currentEmail={currentEmail}
            currentId={currentId}
          />
        </div>
        {/* dim the peeking chat while the drawer is open */}
        {(navOpen || dragging) && (
          <div
            className="md:hidden absolute inset-0 z-30 bg-black/40 pointer-events-none transition-opacity"
            style={{ opacity: dragging ? (dragX as number) / SIDEBAR_W : 1 }}
          />
        )}
      </div>
    </main>
  );
}
