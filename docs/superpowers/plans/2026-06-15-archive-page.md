# 統合アーカイブページ `/archive` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 日報・ニュース・ノートを 1 か所で「一覧（日付グルーピング）↔ 暦（月グリッド）」切替・タイプ絞り込み・横断検索できる新規ページ `/archive` を作る。

**Architecture:** 新テーブルは作らず既存3テーブル（`daily_reports`/`feed_items`/`notes`）をアプリ側で正規化・マージする。純粋ロジック（JST日付変換・マージ・暦集計・グリッド生成）を `lib/archive.ts` に分離して vitest で TDD。API は `app/api/archive/route.ts` が list/calendar 両モードを返す。UI は `app/archive/` 配下にシェル＋ビュー＋カード分割。

**Tech Stack:** Next.js 15 App Router (edge runtime), Supabase JS, SWR / useSWRInfinite, Tailwind v4, react-markdown, vitest（新規導入・純粋ロジックのみ）。

**設計書:** `docs/superpowers/specs/2026-06-15-archive-page-design.md`

---

## 前提・既存パターン（実装者向け）

- 認証: API は `getAuth()`（`@/lib/auth`）→ `{ email, profile: { id } }` / null。サーバーコンポーネントも同じ。
- DB クライアント: `getServiceClient()`（`@/lib/supabase`）。`runtime = 'edge'` 必須。
- ページング: `created_at` 降順、`.lt('created_at', cursor)`、`limit+1` で hasMore 判定、`{ data, nextCursor }` を返す（`app/api/morning/route.ts` 参照）。
- 既読: `reads(user_id, item_type, item_id)`。`item_type` は `'daily_report' | 'note' | 'feed_item'`（CHECK 済み、**マイグレーション不要**）。既読 POST は型別に既存:
  - report → `/api/daily-reports/{id}/read`
  - note → `/api/notes/{id}/read`
  - news → `/api/morning/{id}/read`
- ILIKE エスケープ: `q.replace(/[\\%_]/g, m => '\\' + m)`（`app/api/chat/search/route.ts` 参照）。
- profiles 埋め込みは FK 明示: `author:profiles!daily_reports_author_id_fkey(...)` / `notes_author_id_fkey`（PostgREST の embed 曖昧性回避、CLAUDE.md 既知の落とし穴）。
- サーバー/クライアント境界: 共有型は必ず `app/archive/types.ts` に置く（直接 import すると `InvariantError`）。
- パスエイリアス: `@/*` → リポジトリルート。

---

## File Structure

**新規作成:**
- `app/archive/types.ts` — 共有型（`ArchiveItem` 等）
- `lib/archive.ts` — 純粋ロジック（JST・正規化・マージ・暦集計・グリッド）
- `lib/archive.test.ts` — vitest 単体テスト
- `vitest.config.ts` — vitest 設定
- `app/api/archive/route.ts` — GET（list / calendar）
- `app/archive/page.tsx` — サーバーコンポーネント（認証＋初期データ）
- `app/archive/ArchiveItemCard.tsx` — 1項目の描画＋クリック挙動＋既読
- `app/archive/ListView.tsx` — 一覧（日付グルーピング＋もっと見る）
- `app/archive/CalendarView.tsx` — 暦（月グリッド＋当日パネル）
- `app/archive/ArchiveShell.tsx` — ツールバー状態管理＋データ取得

**変更:**
- `package.json` — vitest devDependency ＋ `test` スクリプト
- `tsconfig.json` — `exclude` に test/vitest 設定を追加（CF Pages ビルド保護）
- `app/_components/Nav.tsx` — 「アーカイブ」リンク追加

**マイグレーション:** なし。

---

## Task 1: vitest 導入

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `lib/__smoke__.test.ts`（動作確認用・最後に削除）

- [ ] **Step 1: vitest を devDependency に追加**

Run:
```bash
npm install -D vitest@^2
```
Expected: `package.json` の devDependencies に `vitest` が入る。

- [ ] **Step 2: `package.json` に test スクリプトを追加**

`scripts` に以下を追記（既存 `lint` の下）:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: `vitest.config.ts` を作成**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: tsconfig の exclude に test/設定ファイルを追加**

`tsconfig.json` の `exclude` を以下に変更（CF Pages の `next build` が test を型チェックして落ちるのを防ぐ）:
```json
  "exclude": [
    "node_modules",
    "scripts/synapse-agent",
    "vitest.config.ts",
    "**/*.test.ts"
  ]
```

- [ ] **Step 5: スモークテストを書いて vitest が動くか確認**

`lib/__smoke__.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: PASS（1 test passed）。

- [ ] **Step 6: スモークテスト削除＆コミット**

```bash
rm lib/__smoke__.test.ts
git add package.json package-lock.json vitest.config.ts tsconfig.json
git commit -m "chore: vitest を導入（純粋ロジックの単体テスト用）"
```

---

## Task 2: 共有型 `app/archive/types.ts`

**Files:**
- Create: `app/archive/types.ts`

- [ ] **Step 1: 型を定義**

```ts
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
```

- [ ] **Step 2: コミット**

```bash
git add app/archive/types.ts
git commit -m "feat(archive): 共有型 ArchiveItem を定義"
```

---

## Task 3: 純粋ロジック `lib/archive.ts`（TDD）

**Files:**
- Create: `lib/archive.ts`
- Test: `lib/archive.test.ts`

行ロー型（DB から読む最小フィールド）と正規化・マージ・暦集計・グリッド生成を純粋関数で書く。

- [ ] **Step 1: 失敗するテストを書く**

`lib/archive.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  escapeIlike,
  toJstDate,
  makeExcerpt,
  normalizeReport,
  normalizeNews,
  normalizeNote,
  mergeByCreatedAtDesc,
  aggregateCalendar,
  jstMonthRangeUtc,
  jstDayRangeUtc,
  buildMonthGrid,
  shiftMonth,
  applyReadState,
  READ_ITEM_TYPE,
} from './archive';
import type { ArchiveItem } from '../app/archive/types';

describe('escapeIlike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeIlike('50%_x\\')).toBe('50\\%\\_x\\\\');
  });
});

describe('toJstDate', () => {
  it('rolls a late-UTC time into the next JST day', () => {
    expect(toJstDate('2026-05-28T16:30:00Z')).toBe('2026-05-29');
  });
  it('keeps an early-UTC time on the same JST day', () => {
    expect(toJstDate('2026-05-28T14:59:00Z')).toBe('2026-05-28');
  });
});

describe('makeExcerpt', () => {
  it('collapses whitespace and truncates long text', () => {
    const long = 'a'.repeat(200);
    const out = makeExcerpt(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(141); // 140 + ellipsis
  });
  it('returns empty string for null', () => {
    expect(makeExcerpt(null)).toBe('');
  });
});

describe('normalizers', () => {
  it('normalizeReport uses report_date as date and builds a title', () => {
    const r = normalizeReport(
      { id: 'r1', report_date: '2026-05-29', body: 'done', created_at: '2026-05-29T01:00:00Z', author: { id: 'p1', email: 'a@b.c', display_name: null } },
      false,
    );
    expect(r.type).toBe('report');
    expect(r.date).toBe('2026-05-29');
    expect(r.title).toBe('日報 2026-05-29');
    expect(r.author?.email).toBe('a@b.c');
  });

  it('normalizeNews maps news fields and derives JST date', () => {
    const n = normalizeNews(
      { id: 'f1', source: 'x', source_url: 'https://x.com/p', title: 'GPT', body: null, summary: 'sum', category: 'practical', claude_runnable: false, created_at: '2026-05-28T16:00:00Z' },
      true,
    );
    expect(n.type).toBe('news');
    expect(n.date).toBe('2026-05-29');
    expect(n.url).toBe('https://x.com/p');
    expect(n.category).toBe('practical');
    expect(n.is_read).toBe(true);
  });

  it('normalizeNote falls back to body when title is empty', () => {
    const n = normalizeNote(
      { id: 'no1', title: '   ', body: 'hello world', created_at: '2026-05-29T02:00:00Z', author: [{ id: 'p1', email: 'a@b.c', display_name: 'A' }] },
      false,
    );
    expect(n.type).toBe('note');
    expect(n.title).toBe('hello world');
    expect(n.author?.display_name).toBe('A'); // array embed picks first
  });
});

describe('mergeByCreatedAtDesc', () => {
  it('sorts items newest first', () => {
    const items = [
      { created_at: '2026-05-01T00:00:00Z' },
      { created_at: '2026-05-03T00:00:00Z' },
      { created_at: '2026-05-02T00:00:00Z' },
    ] as ArchiveItem[];
    const out = mergeByCreatedAtDesc(items);
    expect(out.map(i => i.created_at)).toEqual([
      '2026-05-03T00:00:00Z',
      '2026-05-02T00:00:00Z',
      '2026-05-01T00:00:00Z',
    ]);
  });
});

describe('aggregateCalendar', () => {
  it('counts entries per date and type', () => {
    const counts = aggregateCalendar([
      { type: 'news', date: '2026-05-29' },
      { type: 'news', date: '2026-05-29' },
      { type: 'report', date: '2026-05-29' },
      { type: 'note', date: '2026-05-28' },
    ]);
    expect(counts['2026-05-29']).toEqual({ report: 1, news: 2, note: 0 });
    expect(counts['2026-05-28']).toEqual({ report: 0, news: 0, note: 1 });
  });
});

describe('jstMonthRangeUtc', () => {
  it('computes UTC bounds for a JST month', () => {
    const r = jstMonthRangeUtc('2026-05');
    expect(r.startUtc).toBe('2026-04-30T15:00:00.000Z');
    expect(r.endUtc).toBe('2026-05-31T15:00:00.000Z');
    expect(r.firstDay).toBe('2026-05-01');
    expect(r.nextFirstDay).toBe('2026-06-01');
  });
  it('wraps to next year in December', () => {
    expect(jstMonthRangeUtc('2026-12').nextFirstDay).toBe('2027-01-01');
  });
});

describe('jstDayRangeUtc', () => {
  it('computes UTC bounds for a single JST day', () => {
    const r = jstDayRangeUtc('2026-05-29');
    expect(r.startUtc).toBe('2026-05-28T15:00:00.000Z');
    expect(r.endUtc).toBe('2026-05-29T15:00:00.000Z');
  });
});

describe('buildMonthGrid', () => {
  it('pads leading blanks and fills full weeks', () => {
    // 2026-05-01 is a Friday (getUTCDay = 5)
    const cells = buildMonthGrid('2026-05');
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(cells[5]).toBe('2026-05-01');
    expect(cells).toContain('2026-05-31');
  });
});

describe('shiftMonth', () => {
  it('moves forward and backward across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('applyReadState', () => {
  it('marks items read using type-prefixed keys', () => {
    const items = [
      { id: 'a', type: 'report' } as ArchiveItem,
      { id: 'b', type: 'news' } as ArchiveItem,
    ];
    const set = new Set([`${READ_ITEM_TYPE.report}:a`]);
    applyReadState(items, set);
    expect(items[0].is_read).toBe(true);
    expect(items[1].is_read).toBe(false);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm test`
Expected: FAIL（`Cannot find module './archive'` 等、全テスト失敗）。

- [ ] **Step 3: `lib/archive.ts` を実装**

```ts
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
```

- [ ] **Step 4: テストを実行して合格を確認**

Run: `npm test`
Expected: PASS（全テスト合格）。

- [ ] **Step 5: コミット**

```bash
git add lib/archive.ts lib/archive.test.ts
git commit -m "feat(archive): 純粋ロジック（JST/正規化/マージ/暦）を TDD で実装"
```

---

## Task 4: API ルート `app/api/archive/route.ts`

**Files:**
- Create: `app/api/archive/route.ts`

list（`view=list` デフォルト）と calendar（`view=calendar`）の2モードを1ハンドラで返す。各テーブルを個別クエリ→正規化→`mergeByCreatedAtDesc`→ページ確定→既読付与。

> **検索の制限（既知）:** news/note は複数カラム検索のため PostgREST `.or()` を使う。クエリにカンマ・括弧が含まれると `.or()` のパースが壊れうる。2人運用・単語検索が前提なので許容（コメントで明記）。

- [ ] **Step 1: ルートを実装**

```ts
import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import {
  escapeIlike, normalizeReport, normalizeNews, normalizeNote,
  mergeByCreatedAtDesc, aggregateCalendar, applyReadState,
  jstMonthRangeUtc, jstDayRangeUtc, toJstDate,
  type ReportRow, type NewsRow, type NoteRow,
} from '@/lib/archive';
import type { ArchiveItem, ArchiveType } from '@/app/archive/types';

export const runtime = 'edge';

type Db = ReturnType<typeof getServiceClient>;

const ALL_TYPES: ArchiveType[] = ['report', 'news', 'note'];

function resolveTypes(param: string | null): ArchiveType[] {
  if (!param || param === 'all') return ALL_TYPES;
  return ALL_TYPES.filter(t => t === param);
}

export async function GET(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const db = getServiceClient();
  const types = resolveTypes(searchParams.get('type'));

  if (searchParams.get('view') === 'calendar') {
    return calendarResponse(db, searchParams, types);
  }
  return listResponse(db, auth.profile.id, searchParams, types);
}

async function listResponse(
  db: Db, profileId: string, searchParams: URLSearchParams, types: ArchiveType[],
) {
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
  const cursor = searchParams.get('cursor');
  const date = searchParams.get('date'); // 暦の当日パネル用（YYYY-MM-DD）
  const rawQ = (searchParams.get('q') ?? '').trim();
  const q = rawQ ? escapeIlike(rawQ) : null;
  const category = searchParams.get('category');
  const day = date ? jstDayRangeUtc(date) : null;
  const fetchLimit = date ? 200 : limit + 1; // 単日は全件、それ以外はページ単位

  const collected: ArchiveItem[] = [];

  if (types.includes('report')) {
    let rq = db.from('daily_reports')
      .select('id, report_date, body, created_at, author:profiles!daily_reports_author_id_fkey(id, email, display_name)')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (date) rq = rq.eq('report_date', date);
    if (cursor && !date) rq = rq.lt('created_at', cursor);
    if (q) rq = rq.ilike('body', `%${q}%`);
    const { data } = await rq;
    for (const r of (data ?? []) as unknown as ReportRow[]) collected.push(normalizeReport(r, false));
  }

  if (types.includes('note')) {
    let nq = db.from('notes')
      .select('id, title, body, created_at, author:profiles!notes_author_id_fkey(id, email, display_name)')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (day) nq = nq.gte('created_at', day.startUtc).lt('created_at', day.endUtc);
    if (cursor && !date) nq = nq.lt('created_at', cursor);
    if (q) nq = nq.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
    const { data } = await nq;
    for (const n of (data ?? []) as unknown as NoteRow[]) collected.push(normalizeNote(n, false));
  }

  if (types.includes('news')) {
    let fq = db.from('feed_items')
      .select('id, source, source_url, title, body, summary, category, claude_runnable, created_at')
      .order('created_at', { ascending: false })
      .limit(fetchLimit);
    if (day) fq = fq.gte('created_at', day.startUtc).lt('created_at', day.endUtc);
    if (cursor && !date) fq = fq.lt('created_at', cursor);
    if (category) fq = fq.eq('category', category);
    if (q) fq = fq.or(`title.ilike.%${q}%,body.ilike.%${q}%,summary.ilike.%${q}%`);
    const { data } = await fq;
    for (const f of (data ?? []) as unknown as NewsRow[]) collected.push(normalizeNews(f, false));
  }

  const merged = mergeByCreatedAtDesc(collected);
  const hasMore = !date && merged.length > limit;
  const page = hasMore ? merged.slice(0, limit) : merged;

  const ids = page.map(i => i.id);
  if (ids.length) {
    const { data: reads } = await db.from('reads')
      .select('item_type, item_id')
      .eq('user_id', profileId)
      .in('item_id', ids);
    const readSet = new Set((reads ?? []).map(r => `${r.item_type}:${r.item_id}`));
    applyReadState(page, readSet);
  }

  const nextCursor = hasMore ? page[page.length - 1].created_at : null;
  return Response.json({ data: page, nextCursor });
}

async function calendarResponse(db: Db, searchParams: URLSearchParams, types: ArchiveType[]) {
  const month = searchParams.get('month');
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return Response.json({ error: 'month=YYYY-MM required' }, { status: 400 });
  }
  const { startUtc, endUtc, firstDay, nextFirstDay } = jstMonthRangeUtc(month);
  const entries: Array<{ type: ArchiveType; date: string }> = [];

  if (types.includes('report')) {
    const { data } = await db.from('daily_reports')
      .select('report_date')
      .gte('report_date', firstDay).lt('report_date', nextFirstDay);
    for (const r of data ?? []) entries.push({ type: 'report', date: r.report_date as string });
  }
  if (types.includes('note')) {
    const { data } = await db.from('notes')
      .select('created_at')
      .gte('created_at', startUtc).lt('created_at', endUtc);
    for (const n of data ?? []) entries.push({ type: 'note', date: toJstDate(n.created_at as string) });
  }
  if (types.includes('news')) {
    const { data } = await db.from('feed_items')
      .select('created_at')
      .gte('created_at', startUtc).lt('created_at', endUtc);
    for (const f of data ?? []) entries.push({ type: 'news', date: toJstDate(f.created_at as string) });
  }

  return Response.json({ counts: aggregateCalendar(entries) });
}
```

- [ ] **Step 2: dev サーバを起動して list モードを検証**

> dev サーバは別ターミナルで `cd C:\Users\chiba\work\synapse && npm run dev`（このセッションのバックグラウンドだと刈られる）。

Run:
```bash
curl -s "http://localhost:3000/api/archive?view=list&limit=5" | head -c 800
```
Expected: `{"data":[...],"nextCursor":...}` で日報・ニュース・ノートが混在し `created_at` 降順。401 の場合はローカル認証（`x-user-email`）が無いだけなので、ブラウザで `http://localhost:3000/archive`（Task 8 以降）から確認に切替。

- [ ] **Step 3: calendar モードを検証**

Run:
```bash
curl -s "http://localhost:3000/api/archive?view=calendar&month=2026-05" | head -c 400
```
Expected: `{"counts":{"2026-05-29":{"report":..,"news":..,"note":..}, ...}}`。

- [ ] **Step 4: コミット**

```bash
git add app/api/archive/route.ts
git commit -m "feat(archive): /api/archive（list + calendar）を実装"
```

---

## Task 5: Nav に「アーカイブ」を追加

**Files:**
- Modify: `app/_components/Nav.tsx:8-13`

- [ ] **Step 1: links 配列にアーカイブを追加**

`links` を以下に変更:
```tsx
const links = [
  { href: '/chat', label: 'Chat' },
  { href: '/morning', label: 'Morning' },
  { href: '/daily-reports', label: '日報' },
  { href: '/notes', label: 'ノート' },
  { href: '/archive', label: 'アーカイブ' },
];
```

- [ ] **Step 2: コミット**

```bash
git add app/_components/Nav.tsx
git commit -m "feat(archive): Nav にアーカイブリンクを追加"
```

---

## Task 6: 項目カード `app/archive/ArchiveItemCard.tsx`

**Files:**
- Create: `app/archive/ArchiveItemCard.tsx`

ニュース＝外部URLを新規タブで開く／日報・ノート＝インライン展開。クリックで既読化（型別エンドポイント）。

- [ ] **Step 1: コンポーネントを実装**

```tsx
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MarkdownBody } from '@/components/MarkdownBody';
import type { ArchiveItem } from './types';

const TYPE_LABEL: Record<ArchiveItem['type'], string> = {
  report: '日報', news: 'ニュース', note: 'ノート',
};
const TYPE_ACCENT: Record<ArchiveItem['type'], string> = {
  report: 'bg-blue-500', news: 'bg-violet-500', note: 'bg-emerald-500',
};
const CATEGORY_LABEL: Record<NonNullable<ArchiveItem['category']>, string> = {
  practical: '実用', knowledge: '知識', claude_runnable: '試せる',
};

const READ_ENDPOINT: Record<ArchiveItem['type'], (id: string) => string> = {
  report: id => `/api/daily-reports/${id}/read`,
  note: id => `/api/notes/${id}/read`,
  news: id => `/api/morning/${id}/read`,
};

export default function ArchiveItemCard({
  item, onRead,
}: {
  item: ArchiveItem;
  onRead: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [loadingBody, setLoadingBody] = useState(false);

  async function markRead() {
    if (item.is_read) return;
    onRead(item.id); // optimistic（親が状態更新）
    await fetch(READ_ENDPOINT[item.type](item.id), { method: 'POST' }).catch(() => {});
  }

  async function handleClick() {
    void markRead();
    if (item.type === 'news') {
      if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    // report / note: インライン展開（初回は全文を取得）
    if (!expanded && body === null) {
      setLoadingBody(true);
      try {
        const res = await fetch(`/api/archive/item?type=${item.type}&id=${item.id}`);
        const json = await res.json<{ body: string }>();
        setBody(json.body ?? item.excerpt);
      } catch {
        setBody(item.excerpt);
      } finally {
        setLoadingBody(false);
      }
    }
    setExpanded(v => !v);
  }

  const showUnread = !item.is_read;

  return (
    <Card
      onClick={handleClick}
      className={
        'cursor-pointer transition-colors ' +
        (showUnread ? 'border-primary/40 bg-primary/5 hover:bg-primary/10' : 'hover:bg-secondary/40')
      }
    >
      <CardContent className="pt-4 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`inline-block h-2 w-2 rounded-full ${TYPE_ACCENT[item.type]}`} />
          <span className="text-xs text-muted-foreground">{TYPE_LABEL[item.type]}</span>
          {item.category && (
            <span className="text-xs text-muted-foreground">· {CATEGORY_LABEL[item.category]}</span>
          )}
          {showUnread && <Badge className="text-xs">未読</Badge>}
          <time className="ml-auto text-xs text-muted-foreground">
            {new Date(item.created_at).toLocaleString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
          </time>
        </div>

        <p className="text-sm font-semibold">{item.title}</p>

        {expanded && (item.type === 'report' || item.type === 'note') ? (
          loadingBody ? (
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          ) : (
            <MarkdownBody>{body ?? item.excerpt}</MarkdownBody>
          )
        ) : (
          item.excerpt && <p className="text-sm text-muted-foreground leading-relaxed">{item.excerpt}</p>
        )}

        {item.author && (
          <p className="text-xs text-muted-foreground">
            {item.author.display_name ?? item.author.email}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: 全文取得 API `app/api/archive/item/route.ts` を作成**

インライン展開で日報・ノートの全文を返す軽量エンドポイント。

```ts
import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';

export const runtime = 'edge';

export async function GET(req: Request) {
  const auth = await getAuth().catch(() => null);
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const id = searchParams.get('id');
  if (!id || (type !== 'report' && type !== 'note')) {
    return Response.json({ error: 'invalid params' }, { status: 400 });
  }

  const db = getServiceClient();
  const table = type === 'report' ? 'daily_reports' : 'notes';
  const { data, error } = await db.from(table).select('body').eq('id', id).single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ body: data?.body ?? '' });
}
```

- [ ] **Step 3: コミット**

```bash
git add app/archive/ArchiveItemCard.tsx app/api/archive/item/route.ts
git commit -m "feat(archive): 項目カード（外部遷移/インライン展開/既読）と全文API"
```

---

## Task 7: 一覧ビュー `app/archive/ListView.tsx`

**Files:**
- Create: `app/archive/ListView.tsx`

日付（`item.date`）でグルーピングし、sticky な日付見出し＋カード。`もっと見る` で次ページ。

- [ ] **Step 1: コンポーネントを実装**

```tsx
'use client';

import { Button } from '@/components/ui/button';
import ArchiveItemCard from './ArchiveItemCard';
import type { ArchiveItem } from './types';

function groupByDate(items: ArchiveItem[]): Array<{ date: string; items: ArchiveItem[] }> {
  const groups: Array<{ date: string; items: ArchiveItem[] }> = [];
  for (const it of items) {
    const last = groups[groups.length - 1];
    if (last && last.date === it.date) last.items.push(it);
    else groups.push({ date: it.date, items: [it] });
  }
  return groups;
}

function formatDateHeading(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = ['日', '月', '火', '水', '木', '金', '土'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}月${d}日（${wd}）`;
}

export default function ListView({
  items, hasMore, isLoadingMore, onLoadMore, onRead,
}: {
  items: ArchiveItem[];
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
  onRead: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-center text-sm text-muted-foreground py-12">該当する項目がありません。</p>;
  }

  return (
    <div className="space-y-5">
      {groupByDate(items).map(group => (
        <section key={group.date} className="space-y-2">
          <h2 className="sticky top-12 z-10 -mx-4 px-4 py-1 bg-background/85 backdrop-blur-sm text-xs font-medium text-muted-foreground">
            {formatDateHeading(group.date)}
          </h2>
          {group.items.map(item => (
            <ArchiveItemCard key={`${item.type}:${item.id}`} item={item} onRead={onRead} />
          ))}
        </section>
      ))}

      {hasMore && (
        <Button variant="ghost" className="w-full text-muted-foreground" onClick={onLoadMore} disabled={isLoadingMore}>
          {isLoadingMore ? '読み込み中…' : 'もっと見る'}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add app/archive/ListView.tsx
git commit -m "feat(archive): 一覧ビュー（日付グルーピング）"
```

---

## Task 8: 暦ビュー `app/archive/CalendarView.tsx`

**Files:**
- Create: `app/archive/CalendarView.tsx`

月グリッド＋タイプ別ドット＋件数。日クリックでその日の項目をパネル展開（list API の `date` パラメータ）。

- [ ] **Step 1: コンポーネントを実装**

```tsx
'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { buildMonthGrid, shiftMonth } from '@/lib/archive';
import ArchiveItemCard from './ArchiveItemCard';
import type { ArchiveItem, ArchiveType, CalendarCounts } from './types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const DOT: Record<ArchiveType, string> = {
  report: 'bg-blue-500', news: 'bg-violet-500', note: 'bg-emerald-500',
};
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function CalendarView({
  initialMonth, type, onRead,
}: {
  initialMonth: string;
  type: string; // 'all' | ArchiveType
  onRead: (id: string) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data: cal } = useSWR<{ counts: CalendarCounts }>(
    `/api/archive?view=calendar&month=${month}&type=${type}`,
    fetcher,
  );
  const counts = cal?.counts ?? {};

  const { data: dayData } = useSWR<{ data: ArchiveItem[] }>(
    selectedDay ? `/api/archive?view=list&date=${selectedDay}&type=${type}` : null,
    fetcher,
  );

  const cells = buildMonthGrid(month);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button className="text-muted-foreground hover:text-foreground" onClick={() => { setMonth(m => shiftMonth(m, -1)); setSelectedDay(null); }}>◀</button>
        <span className="text-sm font-medium">{month.replace('-', '年')}月</span>
        <button className="text-muted-foreground hover:text-foreground" onClick={() => { setMonth(m => shiftMonth(m, 1)); setSelectedDay(null); }}>▶</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map(w => <div key={w} className="text-xs text-muted-foreground py-1">{w}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} />;
          const c = counts[date];
          const total = c ? c.report + c.news + c.note : 0;
          const dayNum = Number(date.slice(-2));
          const isSel = selectedDay === date;
          return (
            <button
              key={date}
              onClick={() => setSelectedDay(isSel ? null : date)}
              className={
                'aspect-square rounded-md border p-1 flex flex-col items-start text-left transition-colors ' +
                (isSel ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/50')
              }
            >
              <span className="text-xs">{dayNum}</span>
              {total > 0 && (
                <span className="mt-auto flex items-center gap-0.5 flex-wrap">
                  {c.report > 0 && <span className={`h-1.5 w-1.5 rounded-full ${DOT.report}`} />}
                  {c.news > 0 && <span className={`h-1.5 w-1.5 rounded-full ${DOT.news}`} />}
                  {c.note > 0 && <span className={`h-1.5 w-1.5 rounded-full ${DOT.note}`} />}
                  <span className="text-[10px] text-muted-foreground">{total}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground">{selectedDay} の項目</p>
          {!dayData ? (
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          ) : dayData.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">この日の項目はありません。</p>
          ) : (
            dayData.data.map(item => (
              <ArchiveItemCard key={`${item.type}:${item.id}`} item={item} onRead={onRead} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add app/archive/CalendarView.tsx
git commit -m "feat(archive): 暦ビュー（月グリッド＋当日パネル）"
```

---

## Task 9: シェル `app/archive/ArchiveShell.tsx`

**Files:**
- Create: `app/archive/ArchiveShell.tsx`

ツールバー（タイプチップ・ビュー切替・category・検索）＋データ取得を統括。view は localStorage 記憶。list は `useSWRInfinite`（params 込みキー）。

- [ ] **Step 1: コンポーネントを実装**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import useSWRInfinite from 'swr/infinite';
import ListView from './ListView';
import CalendarView from './CalendarView';
import type { ArchiveItem, ArchiveType, ListResponse } from './types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const TYPE_CHIPS: Array<{ value: 'all' | ArchiveType; label: string }> = [
  { value: 'all', label: 'すべて' },
  { value: 'report', label: '日報' },
  { value: 'news', label: 'ニュース' },
  { value: 'note', label: 'ノート' },
];
const CATEGORY_CHIPS: Array<{ value: string; label: string }> = [
  { value: 'practical', label: '実用' },
  { value: 'knowledge', label: '知識' },
  { value: 'claude_runnable', label: '試せる' },
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ArchiveShell({ initialList }: { initialList: ListResponse }) {
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [type, setType] = useState<'all' | ArchiveType>('all');
  const [category, setCategory] = useState<string | null>(null);
  const [rawQ, setRawQ] = useState('');
  const [q, setQ] = useState('');

  // localStorage から view 復元
  useEffect(() => {
    const saved = localStorage.getItem('archive-view');
    if (saved === 'list' || saved === 'calendar') setView(saved);
  }, []);
  useEffect(() => { localStorage.setItem('archive-view', view); }, [view]);

  // 検索 debounce
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQ(rawQ.trim()), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawQ]);

  // category は一覧モード かつ all/news のときだけ有効
  const categoryActive = view === 'list' && (type === 'all' || type === 'news');
  const effectiveCategory = categoryActive ? category : null;

  const buildParams = (cursor?: string) => {
    const p = new URLSearchParams({ view: 'list', type, limit: '20' });
    if (cursor) p.set('cursor', cursor);
    if (q) p.set('q', q);
    if (effectiveCategory) p.set('category', effectiveCategory);
    return p.toString();
  };

  const getKey = (index: number, prev: ListResponse | null) => {
    if (prev && !prev.nextCursor) return null;
    if (index === 0) return `/api/archive?${buildParams()}`;
    return `/api/archive?${buildParams(prev!.nextCursor!)}`;
  };

  const { data: pages, size, setSize, mutate, isValidating } = useSWRInfinite<ListResponse>(
    getKey, fetcher,
    {
      fallbackData: q === '' && type === 'all' && !effectiveCategory ? [initialList] : undefined,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    },
  );

  const items = pages?.flatMap(p => p.data) ?? [];
  const hasMore = pages ? !!pages[pages.length - 1]?.nextCursor : !!initialList.nextCursor;
  const isLoadingMore = isValidating && size > (pages?.length ?? 0);

  function markReadLocal(id: string) {
    mutate(
      ps => ps?.map(p => ({ ...p, data: p.data.map(i => (i.id === id ? { ...i, is_read: true } : i)) })),
      { revalidate: false },
    );
  }

  return (
    <div className="space-y-4">
      {/* タイプチップ + ビュー切替 */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 flex-wrap">
          {TYPE_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => setType(chip.value)}
              className={
                'px-2.5 py-1 rounded-full text-xs transition-colors ' +
                (type === chip.value ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-secondary/60')
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1">
          <button onClick={() => setView('list')} className={'px-2 py-1 rounded-md text-xs ' + (view === 'list' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>≣ 一覧</button>
          <button onClick={() => setView('calendar')} className={'px-2 py-1 rounded-md text-xs ' + (view === 'calendar' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground')}>▦ 暦</button>
        </div>
      </div>

      {/* category（一覧 かつ all/news のみ） */}
      {categoryActive && (
        <div className="flex gap-1 flex-wrap">
          {CATEGORY_CHIPS.map(chip => (
            <button
              key={chip.value}
              onClick={() => setCategory(c => (c === chip.value ? null : chip.value))}
              className={
                'px-2 py-0.5 rounded-full text-xs transition-colors ' +
                (category === chip.value ? 'bg-violet-500 text-white' : 'border border-border text-muted-foreground hover:bg-secondary/60')
              }
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* 検索 */}
      <input
        value={rawQ}
        onChange={e => setRawQ(e.target.value)}
        placeholder="🔍 全部から検索…"
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      {view === 'list' ? (
        <ListView
          items={items}
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={() => setSize(s => s + 1)}
          onRead={markReadLocal}
        />
      ) : (
        <CalendarView initialMonth={currentMonth()} type={type} onRead={markReadLocal} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add app/archive/ArchiveShell.tsx
git commit -m "feat(archive): シェル（ツールバー＋データ取得統括）"
```

---

## Task 10: ページ `app/archive/page.tsx`

**Files:**
- Create: `app/archive/page.tsx`

サーバーコンポーネント。認証＋初期一覧データ（list/all/先頭ページ）を SSR して `ArchiveShell` に渡す。

- [ ] **Step 1: ページを実装**

```tsx
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import {
  normalizeReport, normalizeNews, normalizeNote, mergeByCreatedAtDesc, applyReadState,
  type ReportRow, type NewsRow, type NoteRow,
} from '@/lib/archive';
import ArchiveShell from './ArchiveShell';
import type { ArchiveItem, ListResponse } from './types';

export const runtime = 'edge';
const PAGE_SIZE = 20;

async function getInitial(profileId: string): Promise<ListResponse> {
  try {
    const db = getServiceClient();
    const collected: ArchiveItem[] = [];

    const [reports, notes, news] = await Promise.all([
      db.from('daily_reports')
        .select('id, report_date, body, created_at, author:profiles!daily_reports_author_id_fkey(id, email, display_name)')
        .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1),
      db.from('notes')
        .select('id, title, body, created_at, author:profiles!notes_author_id_fkey(id, email, display_name)')
        .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1),
      db.from('feed_items')
        .select('id, source, source_url, title, body, summary, category, claude_runnable, created_at')
        .order('created_at', { ascending: false }).limit(PAGE_SIZE + 1),
    ]);

    for (const r of (reports.data ?? []) as unknown as ReportRow[]) collected.push(normalizeReport(r, false));
    for (const n of (notes.data ?? []) as unknown as NoteRow[]) collected.push(normalizeNote(n, false));
    for (const f of (news.data ?? []) as unknown as NewsRow[]) collected.push(normalizeNews(f, false));

    const merged = mergeByCreatedAtDesc(collected);
    const hasMore = merged.length > PAGE_SIZE;
    const page = hasMore ? merged.slice(0, PAGE_SIZE) : merged;

    const ids = page.map(i => i.id);
    if (ids.length) {
      const { data: reads } = await db.from('reads')
        .select('item_type, item_id').eq('user_id', profileId).in('item_id', ids);
      const readSet = new Set((reads ?? []).map(r => `${r.item_type}:${r.item_id}`));
      applyReadState(page, readSet);
    }

    return { data: page, nextCursor: hasMore ? page[page.length - 1].created_at : null };
  } catch {
    return { data: [], nextCursor: null };
  }
}

export default async function ArchivePage() {
  const auth = await getAuth().catch(() => null);
  if (!auth) redirect('/');

  const initial = await getInitial(auth.profile.id);

  return (
    <main className="mx-auto max-w-2xl w-full px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 mb-4">アーカイブ</h1>
      <ArchiveShell initialList={initial} />
    </main>
  );
}
```

- [ ] **Step 2: コミット**

```bash
git add app/archive/page.tsx
git commit -m "feat(archive): /archive ページ（SSR 初期データ＋シェル）"
```

---

## Task 11: 実地検証（dev サーバ）

**Files:** なし（手動確認）

> dev サーバは別ターミナルで起動済み前提（`npm run dev`）。スクリーンショットはヘッドレス Chrome で取得可。

- [ ] **Step 1: 型チェック**

Run: `npx tsc --noEmit`
Expected: エラー無し（`app/archive/**`・`lib/archive.ts`・`app/api/archive/**` で型エラーが出ないこと）。

- [ ] **Step 2: lint**

Run: `npm run lint`
Expected: archive 関連ファイルで新規エラー無し。

- [ ] **Step 3: 単体テスト再実行**

Run: `npm test`
Expected: PASS。

- [ ] **Step 4: ブラウザ確認（チェックリスト）**

`http://localhost:3000/archive` を開いて以下を確認:
- 一覧モード: 日報・ニュース・ノートが日付見出しで区切られて新しい順に並ぶ
- タイプチップ（すべて/日報/ニュース/ノート）で絞り込みが効く
- 検索ボックスに単語を入れると横断フラット結果に切り替わる
- category チップは「一覧 かつ すべて/ニュース」のときだけ出る
- ニュースをクリック→外部URLが新規タブで開く＋未読が消える
- 日報/ノートをクリック→その場で全文展開＋未読が消える
- 暦モードに切替→月グリッドにタイプ別ドット＋件数。日クリックでその日の項目が下に出る。◀▶で月移動
- ビュー切替がリロード後も保持（localStorage）
- スマホ幅（DevTools）でチップ折返し・グリッド圧縮が破綻しない

- [ ] **Step 5: 完了コミット（あれば微修正をまとめて）**

```bash
git add -A
git commit -m "test(archive): 実地検証で見つかった微修正" || echo "修正なし"
```

---

## Self-Review（実装者は着手前に一読）

- **spec カバレッジ**: 統合ページ(Task10) / データ統合(Task3,4) / list+calendar API(Task4) / 一覧=日付グルーピング(Task7) / 暦=月グリッド(Task8) / タイプ絞り込み・検索・category一覧のみ(Task9) / クリック挙動 news外部・report,noteインライン(Task6) / 既読(Task6, 既存エンドポイント) / モバイル(Task11 確認) — すべて対応。
- **DB マイグレーション不要**を確認済み（`reads.item_type` 既に3種対応、新テーブル無し）。
- **型整合**: `ArchiveItem` / `ReportRow`/`NewsRow`/`NoteRow` / `READ_ITEM_TYPE` / `ListResponse` をタスク間で同名・同形で使用。
- **既知の割り切り**: (1) マージ式ページングは単一ソースが1ページ内に多すぎると境界で取りこぼし得る（2人運用・news数件/日で許容）。(2) `.or()` 検索はクエリ内のカンマ/括弧で壊れうる（単語検索前提）。両方コード/計画にコメント済み。
