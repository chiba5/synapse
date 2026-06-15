# 統合アーカイブページ `/archive` — 設計書

- 日付: 2026-06-15
- サブプロジェクト: 「一覧性・検索性 + カレンダー UI」（Synapse Store 拡張の一部 / Phase 4 相当）
- ステータス: 設計確定（実装計画は別途 writing-plans で作成）

---

## 1. 背景と目的

Synapse には日報・ニュース・ノートが日々蓄積されるが、各ページが「新しい順に無限スクロール」するだけで、**一覧性・検索性・日付での掘り返しができない**。古い情報に辿り着けず、溜めても活かせていない。

本サブプロジェクトは「**過去を掘り返す専用面**」を 1 か所に作る。毎日見る入口（朝ダッシュボード）は別サブプロジェクト #3 の担当で、本ページはアーカイブ＝検索・回顧に特化する。

### スコープ外（やらないこと）
- ニュース収集の精度改善（別サブプロジェクト #1 = Input v2）
- 朝のホーム / IA 再設計（別サブプロジェクト #3）
- チャットはアーカイブ対象に含めない（独自の全文検索 + vault アーカイブが既にある）
- 日本語全文検索エンジン（FTS）。検索は既存チャット検索と同じ ILIKE 方式

---

## 2. 対象データ

既存 3 テーブルをそのまま読み取り統合する。**新テーブル・DB view は作らない**（二人運用の規模ではアプリ側マージで十分）。

| type | 元テーブル | 検索対象カラム | 日付の基準 |
|---|---|---|---|
| `report` | `daily_reports` | `body` | `report_date`（無ければ `created_at`） |
| `news` | `feed_items` | `title` / `body` / `summary` | `created_at` |
| `note` | `notes` | `title` / `body` | `created_at` |

### 正規化形 `ArchiveItem`

```ts
type ArchiveItem = {
  id: string;
  type: 'report' | 'news' | 'note';
  date: string;          // JST 基準の YYYY-MM-DD（グルーピング用）
  created_at: string;    // ソート用 ISO
  title: string;         // news=title / report=日付ラベル / note=title or 抜粋
  excerpt: string;       // 本文先頭の抜粋
  is_read: boolean;
  // type 別メタ
  category?: 'practical' | 'knowledge' | 'claude_runnable' | null; // news のみ
  source?: 'x' | 'rss' | 'web_search' | null;                      // news のみ
  url?: string | null;                                             // news の source_url
  author?: { id: string; email: string; display_name: string | null }; // report/note
};
```

日付は JST（`Asia/Tokyo`）で `YYYY-MM-DD` に丸めてグルーピングに使う（チャット vault アーカイブと同じ JST 基準）。

---

## 3. API: `/api/archive`

Edge runtime。CF Access 認証は既存 `lib/auth.ts` / `lib/user.ts` を流用。

### 3.1 一覧モード
```
GET /api/archive?view=list&type=<all|report|news|note>&category=<...>&q=<...>&cursor=<created_at>
```
- 各テーブルを個別クエリ → アプリ側で `created_at` 降順マージ
- `type` でテーブルを絞る（`all` は 3 つ全部）
- `category` は `type=news`（または all）かつ一覧モードでのみ適用。news 以外には影響しない
- `q` 指定時は各テーブルの検索対象カラムに ILIKE をかけてからマージ（横断検索のフラット結果）
- カーソルページング：`created_at` ベース。マージ後 `PAGE_SIZE`（既存に合わせ 20）+ 1 で hasMore 判定
- 各項目の `is_read` は `reads` テーブル JOIN（`item_type` = report/news/note、`item_id`）

### 3.2 暦モード
```
GET /api/archive?view=calendar&month=YYYY-MM&type=<all|report|news|note>
```
- 月内の各日について **タイプ別件数** を返す: `{ "2026-05-29": { report: 1, news: 4, note: 1 }, ... }`
- 集計は JST 日付基準
- 日クリック時はその日の項目を 3.1 の一覧 API（`q` 無し・該当日範囲）で取得する。`category` は暦モードでは送らない

---

## 4. UI

新規ページ `/archive`。ナビ（既存 Nav コンポーネント）に「アーカイブ」を追加。デザインは既存のグラスモーフィズム + Tailwind v4（グラデは `bg-linear-*`）を踏襲。

### 4.1 ツールバー（上部固定）
- **タイプ絞り込みチップ**: すべて / 日報 / ニュース / ノート（色: 📝青 / 📰紫 / 🟢緑）
- **ビュー切替トグル**: 一覧 ↔ 暦（状態は `localStorage` に記憶）
- **category 絞り込み**: 一覧モードかつ（すべて or ニュース）選択時のみ表示（practical/knowledge/claude_runnable）
- **検索ボックス**: debounce 付き。入力するとタイプ横断のフラット結果に切替（暦モードでも一覧結果に落ちる）

### 4.2 一覧モード（デフォルト、= 案 C）
- 日付見出し（JST）で区切ったタイムライン、sticky な日付ヘッダ
- 無限スクロール（カーソルページング）
- スマホでもデフォルトはこの一覧

### 4.3 暦モード（= 案 A）
- 月グリッド（前月/翌月ナビ）
- 各日セルにタイプ別の色ドット＋件数バッジ
- 日をクリック → その日の項目をパネル（PC は横、スマホは下）に展開
- スマホではグリッドを圧縮表示

### 4.4 項目の描画とクリック挙動
- 既存カードスタイルを流用。ニュースは category バッジ + ソースリンク、日報/ノートは著者 + 抜粋
- **クリック挙動（確定）**:
  - `news` → `source_url`（外部 URL）を新規タブで開く
  - `report` / `note` → その場でインライン展開（全文表示）
- 既読: `reads` テーブル流用。未読を控えめに強調。展開/外部遷移で既読化

### 4.5 モバイル
- チャット同様スマホ最優先。チップは折返し、暦は圧縮、一覧がデフォルト

---

## 5. コンポーネント分割

| 単位 | 役割 | 依存 |
|---|---|---|
| `app/archive/page.tsx` | サーバーコンポーネント。認証・初期データ取得 | `lib/auth`, `lib/supabase`, types |
| `app/archive/types.ts` | `ArchiveItem` 等の共有型（サーバ/クライアント境界対策） | なし |
| `app/archive/ArchiveShell.tsx` | クライアント。ツールバー状態（type/category/view/q）管理 | types, SWR |
| `app/archive/ListView.tsx` | 一覧（日付グルーピング + 無限スクロール） | types |
| `app/archive/CalendarView.tsx` | 暦（月グリッド + 当日パネル） | types |
| `app/archive/ArchiveItemCard.tsx` | 1 項目の描画 + クリック挙動 + 既読 | types, ChatMarkdown 等流用可 |
| `app/api/archive/route.ts` | list / calendar 両モードの GET | lib/supabase, lib/auth |

> サーバーコンポーネントからクライアントの型を直接 import すると `InvariantError` が出るため、共有型は必ず `app/archive/types.ts` に分離する（既存 `DailyReportsFeed` / `types.ts` の構成に倣う）。

---

## 6. エラーハンドリング

- 各テーブルクエリは個別に try/catch。1 テーブル失敗時も他は表示（部分的劣化）
- DB 接続不可時は既存日報ページと同じくエラーメッセージ表示
- 検索結果 0 件・該当日 0 件は明示的な empty state を出す

---

## 7. テスト方針

- API: type/category/q/cursor の組合せでマージ・ページング・ILIKE が正しいか
- 暦集計が JST 日付で正しく丸められるか（UTC との境界日）
- 既読 JOIN が type をまたいで衝突しないか（item_type 区別）
- クリック挙動（news=外部 / report・note=展開）の分岐

---

## 8. 確定した設計判断ログ

- 置き場所: **統合アーカイブページ（新規 /archive）**（per-page 強化ではなく 1 か所集約）
- 暦 = 月グリッド（案 A） / 一覧 = 日付グルーピング・タイムライン（案 C）、トグル切替
- 対象: 日報 + ニュース + ノート（チャット除外）
- クリック: ニュース=外部 URL / 日報・ノート=インライン展開
- category 絞り込み: 一覧モードのみ
