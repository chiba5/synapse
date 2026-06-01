import { getServiceClient } from '@/lib/supabase';
import { getAuth } from '@/lib/auth';
import { getChannelPayload } from '@/lib/chat';
import { redirect } from 'next/navigation';
import ChatShell from './ChatShell';
import type { Channel } from './types';

export const runtime = 'edge';

export default async function ChatPage() {
  const auth = await getAuth().catch(() => null);
  if (!auth) redirect('/');

  const db = getServiceClient();

  const { data: channels } = await db
    .from('channels')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });

  const list = (channels ?? []) as Channel[];
  const channel = list[0];
  if (!channel) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">チャンネルがありません</p>
      </main>
    );
  }

  const initialPayload = await getChannelPayload(db, channel.id);

  return (
    <ChatShell
      channels={list}
      initialChannelId={channel.id}
      initialPayload={initialPayload}
      currentEmail={auth.email}
      currentId={auth.profile.id}
    />
  );
}
