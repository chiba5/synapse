# Synapse — チバ+齋藤蓮の外部脳共有ワークスペース

このディレクトリは `~/work/synapse/` で、チバと齋藤蓮（exoskeleton プロジェクト共同開発者）が日々の思考・進捗・情報を共有する「外部脳」PWA のコードベース。`claude` をこの cwd で起動するとこの CLAUDE.md が自動で読まれる。

---

## プロジェクトの目的

チバ + 齋藤蓮の **外部脳**（extended cognition / shared second brain）。日報・進捗・雑多 inbox・AI ニュース・タスク・資料・note（思想と思いつき）を一箇所に集約し、二人が毎日眺める PWA として運用する。

### なぜ既存 SaaS（Notion / Discord / Slack / Scrapbox）でなく自作か

- 二人の運用に**完全にフィット**させるため（ユーザ明言 2026-04-24）
- AI ニュース自動収集 + 週次 AI ダイジェスト等、Claude API を組み込んだ差別化機能を仕込みたい
- データを自分たちで保有し、長期運用しても外部サービスの仕様変更に振り回されない

### 将来の拡大余地

**二人限定ではない**（ユーザ明言 2026-04-24）。将来的に齋藤蓮以外の共同者が増える可能性がある。また exoskeleton 以外の文脈（ポーカー論、研究、日常）も並列に扱う汎用共有ワークスペースとして育てる前提。親ディレクトリを `duo/` 等の「二人専用」カテゴリに入れない判断はこの理由による。

---

## Synapse = 「外部脳」の 3 層モデル（2026-05-20 確定）

**Input → Store → Output** の一本パイプラインとして設計する。

| 層 | 役割 | 具体機能 |
|---|---|---|
| **Input** | 受動的情報摂取 | X 自動収集・RSS/WebSearch・Claude 要約・分類 |
| **Store** | 蓄積基盤 | 日報・notes・アイデア/思想・進捗 mirror・共有資料 |
| **Output** | 昇華 | 蓄積素材を Claude API で再加工→アウトプット |

## Phase 分割（確定版 2026-05-20）

| Phase | 状態 | 機能 | 狙い |
|---|---|---|---|
| **0** | ✅ | 認証・基盤・PWA | Store に触れる土台 |
| **1** | ✅ | 日報・notes・既読 | Store 最小面（毎日使える） |
| **2** | **進行中** | **Input 層 v1 + 自動試行（承認制）** | X(hermes) + RSS/WebSearch → Claude 要約・分類 → `/morning` フィード → 「試す」承認 → ローカル Claude Code 実行 |
| **3** | | Claude Code 進捗 mirror | 各プロジェクト wrap-up を vault 経由で Synapse に取り込み |
| **4** | | Store 拡張 | アイデア/思想 stock、タグ、検索（Output への土台） |
| **5** | | 共有ファイル（R2） | 二人で同じ素材を参照 |
| **6** | | Output 層 v1（昇華 UI） | 蓄積素材を Claude API で再加工→アウトプット |

### 採用した機能（ユーザー確認済み 2026-04-24）

- 既読機能（二人専用だからこそ軽いフィードバック）
- 雑多 inbox（音声メモ・リンクを雑投げ、後で整理）
- AI ニュース自動収集（絶対欲しい枠）
- PWA 化（スマホアプリ別途作らずブラウザホーム画面追加で済ます）

---

## スタック案（Phase 0 実装セッションで最終確定）

- **フロント**：Next.js (App Router) + `next-pwa`
- **ホスティング**：Cloudflare Pages
- **DB**：Cloudflare D1（web-app/pokerops の Supabase より単純なので D1 推し、pokerops との一貫性優先なら Supabase も選択肢）
- **ファイル**：Cloudflare R2（資料共有 Phase 3 用）
- **AI ニュース cron**：ローカル PC 常駐の `scripts/synapse-agent`（Node.js + Windows Task Scheduler）。hermes-x-search MCP で X 収集 → Anthropic SDK で要約・分類 → Supabase 直書き（CF Access バイパス済み、Cloudflare Workers Cron Triggers は不採用）
- **認証**：Cloudflare Access (Google OAuth) か magic link。二人だけ許可、将来招待で拡張可
- **ドメイン**：初期は `<project>.pages.dev` サブドメイン、本格運用時に独自ドメイン検討

### 参考：既存プロジェクトとの関係

- `poker-business/pokerops/` と `poker-business/doublebelly/web-app/` が Cloudflare Pages + Supabase + Next.js の構成で稼働中。知見流用可
- ただし Synapse はポーカー事業とは無関係なので、それらのリポ・DB とは完全分離する

---

## セッション冒頭宣言テンプレート

```
Synapse — チバ+齋藤蓮の外部脳共有 PWA。現状 Phase {X}、次は {Y}。
```

グローバル CLAUDE.md §3「セッション冒頭のプロジェクト宣言」ルール準拠。

---

## 禁止事項・注意点

### シークレット取り扱い（グローバル §4 参照）

**Claude 稼働中に `.dev.vars` / `.env` 等のシークレットファイルを Read / Edit しない**。2026-04-19 の pokerops 事故（OpenAI + Anthropic キー漏洩 → revoke → 2 日で連鎖 revoke）を繰り返さない：

1. キー発行はダッシュボード側で
2. env ファイル編集は必ず Claude `/exit` 後の独立 Git Bash で
3. Claude 再起動後はそのファイルを触らない
4. `.mcp.json` 等には literal を書かず env 変数参照のみ
5. revoke → 再発行時は過去セッションの `.jsonl` も削除

### 他プロジェクトとの混同防止

Synapse は**共有ワークスペース**。exoskeleton の設計資料・進捗は原則 `vault/projects/exoskeleton/` に書く（公開チャネルとしての Synapse と、個人の思考記録としての vault は別）。Synapse 上で「こう書こう」と決めても、vault 側の source of truth と食い違わないように。

### cwd と話題のズレを検知する（グローバル §3 参照）

会話の途中で Synapse 以外のプロジェクト（pokerops / exoskeleton / formal-method 等）の話題に踏み込んだら、その時点で止まってユーザに確認する。

---

## スタック・確定事項（2026-04-24）

- **Frontend**: Next.js 15.5.2 App Router + `@serwist/next` (PWA)
- **Deploy**: Cloudflare Pages + `@cloudflare/next-on-pages`
- **DB**: Supabase (Postgres、Tokyo リージョン)
- **Auth**: Cloudflare Access (Google OAuth)
- **プロジェクト名**: `synapse` 確定

### Windows ビルド制限（重要）

`npm run pages:build`（`vercel build` → `next-on-pages --skip-build`）は Windows でシンボリックリンク権限 (EPERM) が必要。
- **ローカル開発**: `npm run dev` で動く（Edge runtime の dev サーバ）
- **本番ビルド**: GitHub push → Cloudflare Pages が Linux でビルド・デプロイ（これが主ルート）
- **Windows でも動かしたい場合**: 設定 → システム → 開発者向け → 「開発者モード」ON でシンボリックリンク権限が付く

### ローカル開発の環境変数（重要）

`npm run dev` は `.dev.vars` を読まない（wrangler Pages 専用）。ローカル開発には `.env.local` が必要。

```bash
cp .dev.vars.example .env.local   # 初回のみ
npm run dev
```

- `.env.local` は `.gitignore` 済み（`.env*` パターン）
- `setupDevPlatform()` は Windows で `await` すると hang する → `next.config.mjs` で fire-and-forget 化済み
- `getServiceClient()` は `getRequestContext()` → `process.env` の順でフォールバック
- **dev サーバは Claude 経由で起動すると刈られる（確定 2026-06-15）**: `run_in_background` でも `!npm run dev` でも、Claude のタスク管理に紐づくと数秒〜十数秒で `next dev` が graceful shutdown（exit 0）する。**ユーザ自身がタスクバーから独立ターミナルを開いて `npm run dev`** すれば刈られない（`start-dev.bat` も用意・gitignore 済み）。Claude 側で一時的に立てたい時は `explorer.exe start-dev.bat` でジョブから切り離す手もあるが不安定。**画面確認はヘッドレス Chrome（`chrome.exe --headless=new --screenshot`）を 1 コマンド内で「起動→撮影→停止」が確実**。dev では `middleware.ts` が全リクエストに `x-user-email`（`DEV_USER_EMAIL` 既定 `dev@example.com`）を付与するので curl でも API が通る

### サーバー/クライアント境界のルール

- サーバーコンポーネントからクライアントコンポーネントの型を直接 import すると `InvariantError: clientReferenceManifest` が出る
- 共有型は `types.ts` に分離してどちらからも import する（`DailyReportsFeed` / `types.ts` の構成を参照）

## 実装状況（2026-05-20 時点）

### next-on-pages の既知の落とし穴
- `app/favicon.ico` は Next.js App Router の Metadata Route として処理される → `next-on-pages` がルート `/` を favicon の静的ファイルにマッピングするバグが発生する
- **対策**: favicon は `app/` でなく `public/` に置く（`public/favicon.ico`）
- `app/layout.tsx` には必ず `export const runtime = 'edge'` が必要
- `tsconfig.json` の `include: ["**/*.ts"]` は `scripts/synapse-agent/` も拾う → CF Pages ビルドが agent 依存パッケージ（fast-xml-parser 等）を見つけられず失敗する → `exclude` に `"scripts/synapse-agent"` を追加（確定 2026-05-24）

### Tailwind v4 / PostgREST の落とし穴（確定 2026-06-01）
- **Tailwind v4 はグラデーション構文が変わった**: `bg-gradient-to-*` → `bg-linear-to-*`。v3 の旧名は**CSS が一切生成されない**（クラスは DOM に付くが無効）。`backdrop-blur` や `bg-white/N` は効くので「効果が中途半端に消える」状態になり気づきにくい。グラデが効かない時は真っ先にこれを疑う
- **PostgREST の embed 曖昧性**: `messages` と `profiles` の両方に FK を持つ中間テーブル（`message_reactions` 等）を追加すると、PostgREST がそれを junction とみなし `messages → profiles(email)` の埋め込みが「direct FK か junction 経由か」で曖昧になり 500（`Could not embed because more than one relationship was found`）。**対策**: FK を明示して `profiles!messages_sender_id_fkey(email)`（制約名は Postgres インライン FK の自動命名 `<table>_<column>_fkey`）

### CF Access と XHR/fetch の落とし穴（重要）
- CF Access はブラウザのナビゲーションリクエストには `cf-access-jwt-assertion` ヘッダーを付けるが、**client component からの fetch/XHR には付けない**
- ブラウザは `CF_Authorization` クッキーを同一オリジン fetch で送るが、CF Access がそれをヘッダーに変換しない
- **対策**: `middleware.ts` で `cf-access-jwt-assertion` ヘッダーが無い場合は `CF_Authorization` クッキーの値にフォールバックする（`req.cookies.get('CF_Authorization')?.value`）
- 同じ JWKS（`${teamDomain}/cdn-cgi/access/certs`）で両方検証できる（確定 2026-05-24）

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

## 関連ファイル・リンク

- `~/.claude/CLAUDE.md §2` — プロジェクト棚卸し（Synapse もこの表に載っている）
- `~/work/CLAUDE.md` — concierge モード定義（Synapse も concierge 把握対象）
- `C:/Users/chiba/vault/projects/status.md` — Synapse セクションがある
- `C:/Users/chiba/.claude/plans/deep-forging-stream.md` — このディレクトリを作った計画書（2026-04-24）
