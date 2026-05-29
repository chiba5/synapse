import type { Message, ChannelRead, ChatPayload } from '@/app/chat/types';

/**
 * Assemble the full chat payload for a channel: latest 50 messages
 * (ascending), their reactions, and per-user read state.
 * Shared by the SSR page and the polling GET route so both stay in sync.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getChannelPayload(db: any, channelId: string): Promise<ChatPayload> {
  // Latest 50, then flip to chronological order
  const { data: rawMessages } = await db
    .from('messages')
    .select('*, profiles(email)')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(50);

  const messages: Message[] = (rawMessages ?? [])
    .slice()
    .reverse()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => ({
      ...m,
      sender_email: m.profiles?.email ?? m.sender_id,
      profiles: undefined,
      reactions: [] as Message['reactions'],
    }));

  const ids = messages.map((m) => m.id);
  if (ids.length) {
    const { data: rawReactions } = await db
      .from('message_reactions')
      .select('message_id, emoji, reader_id, profiles(email)')
      .in('message_id', ids);

    const byMsg = new Map<string, Message['reactions']>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (rawReactions ?? []) as any[]) {
      const list = byMsg.get(r.message_id) ?? [];
      list.push({
        emoji: r.emoji,
        reader_id: r.reader_id,
        reader_email: r.profiles?.email ?? r.reader_id,
      });
      byMsg.set(r.message_id, list);
    }
    for (const m of messages) m.reactions = byMsg.get(m.id) ?? [];
  }

  const { data: rawReads } = await db
    .from('channel_reads')
    .select('reader_id, last_read_at, profiles(email)')
    .eq('channel_id', channelId);

  const reads: ChannelRead[] = (rawReads ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((r: any) => ({
      reader_id: r.reader_id,
      reader_email: r.profiles?.email ?? r.reader_id,
      last_read_at: r.last_read_at,
    }));

  return { messages, reads };
}
