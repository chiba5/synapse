import { getServiceClient } from '@/lib/supabase';
import { getCurrentEmail } from '@/lib/user';
import { redirect } from 'next/navigation';
import ChatRoom from './ChatRoom';
import type { Channel, Message } from './types';

export const runtime = 'edge';

export default async function ChatPage() {
  const email = await getCurrentEmail().catch(() => null);
  if (!email) redirect('/');

  const db = getServiceClient();

  const { data: channels } = await db
    .from('channels')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(10);

  const channel = channels?.[0] as Channel | undefined;
  if (!channel) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-muted-foreground text-sm">チャンネルがありません</p>
      </main>
    );
  }

  const { data: messages } = await db
    .from('messages')
    .select('*, profiles(email)')
    .eq('channel_id', channel.id)
    .order('created_at', { ascending: true })
    .limit(50);

  const initialMessages: Message[] = (messages ?? []).map((m: any) => ({
    ...m,
    sender_email: m.profiles?.email ?? '',
    profiles: undefined,
  }));

  return (
    <main className="flex flex-1 overflow-hidden">
      <ChatRoom
        channel={channel}
        initialMessages={initialMessages}
        currentEmail={email}
      />
    </main>
  );
}
