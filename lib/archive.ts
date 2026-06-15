import type { ArchiveItem, ArchiveType, ArchiveAuthor, CalendarCounts } from '@/app/archive/types';

// ---- row shapes (DB から読む最小フィールド) ----
type EmbeddedAuthor = ArchiveAuthor | ArchiveAuthor[] | null;
export type ReportRow = { id: string; report_date: string; body: string; created_at: string; author: EmbeddedAuthor };
export type NewsRow = {
  id: string; source: 'x' | 'rss' | 'web_search'; source_url: string | null;
  title: string; body: string | null; summary: string | null;
  category: 'practical' | 'knowledge' | 'claude_runnable' | null;
  claude_runnable: boolean; created_at: string;
};
export type NoteRow = { id: string; title: string | null; body: string; created_at: string; author: EmbeddedAuthor };

// ---- text helpers ----
export function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, m => '\\' + m);
}

const EXCERPT_LEN = 140;
export function makeExcerpt(text: string | null | undefined): string {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  return t.length > EXCERPT_LEN ? t.slice(0, EXCERPT_LEN) + '…' : t;
}

// ---- JST date helpers ----
export function toJstDate(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function jstMonthRangeUtc(month: string): {
  startUtc: string; endUtc: string; firstDay: string; nextFirstDay: string;
} {
  const [y, m] = month.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, 1, -9, 0, 0)).toISOString();
  const endUtc = new Date(Date.UTC(y, m, 1, -9, 0, 0)).toISOString();
  const firstDay = `${month}-01`;
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const nextFirstDay = `${String(nextY).padStart(4, '0')}-${String(nextM).padStart(2, '0')}-01`;
  return { startUtc, endUtc, firstDay, nextFirstDay };
}

export function jstDayRangeUtc(date: string): { startUtc: string; endUtc: string } {
  const [y, m, d] = date.split('-').map(Number);
  const startUtc = new Date(Date.UTC(y, m - 1, d, -9, 0, 0)).toISOString();
  const endUtc = new Date(Date.UTC(y, m - 1, d + 1, -9, 0, 0)).toISOString();
  return { startUtc, endUtc };
}

// ---- author embed ----
function pickAuthor(a: EmbeddedAuthor): ArchiveAuthor | null {
  if (!a) return null;
  const o = Array.isArray(a) ? a[0] : a;
  if (!o) return null;
  return { id: o.id, email: o.email, display_name: o.display_name ?? null };
}

// ---- normalizers ----
export function normalizeReport(row: ReportRow, isRead: boolean): ArchiveItem {
  return {
    id: row.id,
    type: 'report',
    date: row.report_date,
    created_at: row.created_at,
    title: `日報 ${row.report_date}`,
    excerpt: makeExcerpt(row.body),
    is_read: isRead,
    author: pickAuthor(row.author),
  };
}

export function normalizeNews(row: NewsRow, isRead: boolean): ArchiveItem {
  return {
    id: row.id,
    type: 'news',
    date: toJstDate(row.created_at),
    created_at: row.created_at,
    title: row.title,
    excerpt: makeExcerpt(row.summary ?? row.body),
    is_read: isRead,
    category: row.category ?? null,
    source: row.source ?? null,
    url: row.source_url ?? null,
  };
}

export function normalizeNote(row: NoteRow, isRead: boolean): ArchiveItem {
  const title = (row.title ?? '').trim();
  return {
    id: row.id,
    type: 'note',
    date: toJstDate(row.created_at),
    created_at: row.created_at,
    title: title || makeExcerpt(row.body) || '(無題)',
    excerpt: makeExcerpt(row.body),
    is_read: isRead,
    author: pickAuthor(row.author),
  };
}

// ---- merge / aggregate ----
export function mergeByCreatedAtDesc(items: ArchiveItem[]): ArchiveItem[] {
  return [...items].sort((a, b) =>
    a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
  );
}

export function aggregateCalendar(entries: Array<{ type: ArchiveType; date: string }>): CalendarCounts {
  const counts: CalendarCounts = {};
  for (const e of entries) {
    if (!counts[e.date]) counts[e.date] = { report: 0, news: 0, note: 0 };
    counts[e.date][e.type] += 1;
  }
  return counts;
}

// ---- calendar grid ----
export function buildMonthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const startWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(); // 0=Sun
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + delta;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

// ---- read state ----
export const READ_ITEM_TYPE: Record<ArchiveType, string> = {
  report: 'daily_report',
  news: 'feed_item',
  note: 'note',
};

export function applyReadState(items: ArchiveItem[], readSet: Set<string>): void {
  for (const it of items) {
    it.is_read = readSet.has(`${READ_ITEM_TYPE[it.type]}:${it.id}`);
  }
}
