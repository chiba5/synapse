export type FeedItem = {
  id: string;
  source: 'x' | 'rss' | 'web_search';
  source_url: string | null;
  title: string;
  body: string | null;
  summary: string | null;
  category: 'practical' | 'knowledge' | 'claude_runnable' | null;
  claude_runnable: boolean;
  score: number;
  topic: string | null;
  created_at: string;
  is_read: boolean;
};

export type Profile = { id: string; email: string; display_name: string | null };
