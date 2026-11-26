# Synapse 実装ログ

> CLAUDE.md から 2026-07-03 に分離。完了済み機能の記録。新規実装の記録はここに追記する（CLAUDE.md には書かない）。

### 完了済み
- **GitHub**: `chiba5/synapse` (private) 作成・push 済み
- **Cloudflare Pages**: `synapse-9dv.pages.dev` 稼働中（master push で自動ビルド）
- **CF Zero Trust / Access Application**: 設定済み（Google OAuth IdP 登録・Policy 設定含む）
- **CF Pages 環境変数**: `TEAM_DOMAIN` / `ACCESS_AUD` / `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 設定済み
- **Supabase プロジェクト**: ref `piuthseepzqggkrdsdyd`（Tokyo）、初期 schema migration 適用済み
- **Phase 0 完了**（認証・DB・プロフィール upsert・PWA 基盤）
- **Day 4 完了**（2026-05-19）: 日報 GET/POST API・cursor pagination・is_read JOIN・フィードページ・既読マーク・Nav・`lib/auth.ts`
- **Phase 1 notes 完了**（2026-05-19）: `/notes` ページ（タイトル任意・本文必須、一覧・投稿・既読）
- **本番動作確認済み**（2026-05-19）: Home・日報・ノート 全ページ稼働確認
- **Phase 2 完了**（2026-05-24）: `/morning` フィード（48件表示・既読化）・synapse-agent（collect / poll-jobs）・Task Scheduler（毎朝 06:00 collect / at logon poll-jobs）・vault/ai-digest archive
- **チャット機能（`/chat`）完成**（2026-06-01）: テーブル `channels` / `messages` / `message_reactions` / `channel_reads`（`messages.edited_at` / `reply_to` 含む）。機能: 既読（2人運用・相手の last_read_at 基準で ✓✓+時刻）・編集（edited_at ラベル）・hard delete・絵文字リアクション・Markdown/コードブロック（`ChatMarkdown`、`@mention` ハイライト remark プラグイン）・引用リプライ・全文検索（`/api/chat/search`、ILIKE。FTS は日本語トークナイザ無し）・**マルチチャンネル**（`ChatShell` + `ChannelSidebar`、Discord 風、`#general` 保護）。デザインはグラスモーフィズム + グラデ（Tailwind v4 `bg-linear-*`）
- **チャット vault 自動保存**（2026-06-01）: `synapse-agent --mode=archive-chat` → `vault/synapse-chat/<channel>/YYYY-MM.md`（JST 日付グルーピング）。冪等性は各メッセージ末尾の `<!-- mid:<id> -->` マーカーで担保（state ファイル `archive-state.json` は高速化キャッシュ）。**Task Scheduler `Synapse Archive Chat` 毎朝 06:05 登録済み**
- **チャンネル rename/削除 + Discord 風モバイル UX**（2026-06-01・commit f937537）: `PATCH /api/chat/channels/[id]`（rename、`#general` 保護、同名 409）追加。サイドバーの削除/編集アイコンは**ホバー専用 (`opacity-0 group-hover`) だと touch で永遠に出ない**ため常時表示 (`opacity-60`) に修正。モバイルは Discord 風 **peek ドロワー**（`ChatShell`：サイドバーを下層に置きチャット面を `translateX` でスライド、指追従ドラッグ＋方向ロック、`touch-action: pan-y`）＋ **メッセージ長押しボトムシート**（450ms、リアクション/返信/コピー/編集/削除）。**トレードオフ**: `touch-pan-y` によりモバイルではコードブロックの横スクロールが効かない
- **統合アーカイブページ `/archive`**（2026-06-15・merge 695e086 push 済み）: 日報・ニュース・ノートを 1 か所に集約（チャット除外）。**一覧(日付グルーピング)↔暦(月グリッド)** トグル（localStorage 記憶）＋タイプ絞り込みチップ＋横断 ILIKE 検索＋category 絞り込み(一覧のみ)。クリックは **ニュース→外部URL / 日報・ノート→インライン全文展開**（`/api/archive/item`）。**新規 DB マイグレ無し**（既存3テーブルをアプリ側でマージ、`reads.item_type` 流用）。`GET /api/archive?view=list|calendar`。純粋ロジック（JST変換・マージ・暦集計・グリッド生成）は `lib/archive.ts` に分離し **vitest で TDD（`lib/archive.test.ts`・16 tests）**。検索の `.or()` はカンマ/括弧を除去して 500 回避。設計書/計画: `docs/superpowers/{specs,plans}/2026-06-15-archive-page*.md`。**vitest 導入**（`tsconfig` exclude に `**/*.test.ts`・`vitest.config.ts` を追加して CF Pages ビルド保護）

- **Input v2（ニュース精度刷新）**（2026-06-15・`feat/input-v2`）: X をトピック別ダイジェスト化（hermes-x-search を `claude -p` 経由で呼び、`sources.ts` の `TOPICS`×高信号垢から「トピック別ダイジェストカード」を1枚生成。合成 source_url `x-digest://<topic-slug>/<jst>` で既存 UNIQUE index を再利用し冪等）＋RSS/GitHub に Haiku 関心度スコア(0-100)付与・`MIN_SCORE`(既定40)未満は入口で破棄。`feed_items` に `score`(int not null default 0)/`topic`(text) 列追加（マイグレ `20260615120000_feed_score.sql`・**要 Supabase 適用**）。`/morning` は **score 降順キーセット pagination**（cursor=`score|created_at`、`.or()` で `score.lt OR (score.eq AND created_at.lt)`）＋ topic バッジ・★score 表示・`x-digest://` は非リンク化。純粋ロジックは消費者分離で2モジュール（agent: `scripts/synapse-agent/ingest-logic.ts` / web: `lib/feed-ingest.ts`）に分け **vitest TDD**（`vitest.config` include を agent にも拡張）。env: `MIN_SCORE`/`X_DIGEST_SCORE`(既定90)。設計書/計画: `docs/superpowers/{specs,plans}/2026-06-15-input-v2-news-precision*.md`

### 齋藤蓮 CF Access 招待
完了（2026-05-19）。"Allow Team" ポリシー（chuangtaiqianye@gmail.com + anikimcrenn@gmail.com）に更新済み。

### Phase 2 実装（2026-05-20 着手）

**追加ファイル一覧**:
- `supabase/migrations/20260520000000_feed.sql` — `feed_items`, `try_jobs`, `reads` CHECK 拡張
- `app/morning/{page.tsx, MorningFeed.tsx, types.ts}` — 朝フィードページ（notes 複製）
- `app/api/morning/{route.ts, [id]/read/route.ts, [id]/try/route.ts}` — フィード API + 試行承認
- `app/api/ingest/route.ts` — ローカル agent からの収集結果受け取り（Service Token 認証）
- `app/api/jobs/pending/route.ts`, `app/api/jobs/[id]/complete/route.ts` — 試行ジョブキュー
- `lib/anthropic.ts` — 要約 + カテゴリ判定 helper（1 呼び出しで両方）
- `lib/service-auth.ts` — CF Access Service Token 認証ミドルウェア
- `scripts/synapse-agent/{package.json, index.ts, collect.ts, poll-jobs.ts}` — ローカル収集 + 試行 agent

**sources**: `vault/ai-digest/sources.md`（RSS 10 本 + WebSearch クエリ 5 個）を移植。`vault/ai-digest/` は移植完了後 archive。

---
