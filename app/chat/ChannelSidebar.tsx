'use client';

import { useState } from 'react';
import { Hash, Plus, Trash2, Check, X } from 'lucide-react';
import type { Channel } from './types';

export function ChannelSidebar({
  channels,
  selectedId,
  onSelect,
  onCreate,
  onDelete,
}: {
  channels: Channel[];
  selectedId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submit = async () => {
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    const ok = await onCreate(n);
    setBusy(false);
    if (ok) {
      setName('');
      setCreating(false);
    }
  };

  return (
    <aside className="flex flex-col w-16 md:w-60 shrink-0 border-r border-white/10 bg-white/5 backdrop-blur-xl">
      <div className="px-4 py-4 border-b border-white/10 hidden md:block">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">チャンネル</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {channels.map(ch => {
          const active = ch.id === selectedId;
          const isProtected = ch.name === 'general';
          const confirming = confirmId === ch.id;
          return (
            <div
              key={ch.id}
              className={`group/ch flex items-center rounded-lg ${active ? 'bg-violet-500/20' : 'hover:bg-white/5'}`}
            >
              <button
                onClick={() => onSelect(ch.id)}
                className={`flex-1 flex items-center gap-2 px-2.5 py-2 text-sm min-w-0 ${
                  active ? 'text-violet-200 font-medium' : 'text-muted-foreground'
                }`}
                title={ch.name}
              >
                <Hash className="h-4 w-4 shrink-0" />
                <span className="truncate hidden md:inline">{ch.name}</span>
              </button>

              {!isProtected && !confirming && (
                <button
                  onClick={() => setConfirmId(ch.id)}
                  className="hidden md:flex opacity-0 group-hover/ch:opacity-100 h-7 w-7 mr-1 items-center justify-center rounded-md text-muted-foreground hover:text-destructive shrink-0"
                  title="削除"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
              {confirming && (
                <div className="hidden md:flex items-center gap-0.5 mr-1 shrink-0">
                  <button
                    onClick={async () => { setConfirmId(null); await onDelete(ch.id); }}
                    className="h-7 w-7 flex items-center justify-center rounded-md bg-destructive/80 text-white"
                    title="削除する"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmId(null)}
                    className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/10"
                    title="取消"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="p-2 border-t border-white/10">
        {creating ? (
          <div className="flex items-center gap-1">
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submit();
                if (e.key === 'Escape') { setCreating(false); setName(''); }
              }}
              placeholder="チャンネル名"
              disabled={busy}
              className="flex-1 min-w-0 bg-black/20 rounded-md px-2 py-1 text-sm outline-none ring-1 ring-white/15 focus:ring-violet-400/50"
            />
            <button onClick={submit} disabled={busy} className="h-7 w-7 flex items-center justify-center rounded-md bg-violet-500/30 hover:bg-violet-500/50 shrink-0">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => { setCreating(false); setName(''); }} className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-white/10 shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground justify-center md:justify-start"
            title="新規チャンネル"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="hidden md:inline">新規チャンネル</span>
          </button>
        )}
      </div>
    </aside>
  );
}
