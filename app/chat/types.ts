export type Channel = {
  id: string;
  name: string;
  created_at: string;
};

export type Reaction = {
  emoji: string;
  reader_id: string;
  reader_email: string;
};

export type Message = {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_email: string; // joined from profiles - returned by API
  body: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  created_at: string;
  edited_at: string | null;
  reactions: Reaction[];
};

export type ChannelRead = {
  reader_id: string;
  reader_email: string;
  last_read_at: string;
};

export type ChatPayload = {
  messages: Message[];
  reads: ChannelRead[];
};
