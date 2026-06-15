export type ArchiveType = 'report' | 'news' | 'note';

export type ArchiveAuthor = { id: string; email: string; display_name: string | null };

export type ArchiveItem = {
  id: string;
  type: ArchiveType;
  date: string;        // JST 基準 YYYY-MM-DD（グルーピング用）
  created_at: string;  // ISO（ソート・カーソル用）
  title: string;
  excerpt: string;
  is_read: boolean;
  category?: 'practical' | 'knowledge' | 'claude_runnable' | null; // news のみ
  source?: 'x' | 'rss' | 'web_search' | null;                      // news のみ
  url?: string | null;                                             // news の source_url
  author?: ArchiveAuthor | null;                                   // report/note のみ
};

export type CalendarCounts = Record<string, { report: number; news: number; note: number }>;

export type ListResponse = { data: ArchiveItem[]; nextCursor: string | null };
