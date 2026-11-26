# Synapse — チバ+齋藤蓮の外部脳共有ワークスペース

このディレクトリは `~/work/synapse/` で、チバと齋藤蓮（exoskeleton プロジェクト共同開発者）が日々の思考・進捗・情報を共有する「外部脳」PWA のコードベース。この cwd で作業するエージェントの共通ルールを本ファイルに置く。

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

グローバル AGENTS.md §3「セッション冒頭のプロジェクト宣言」ルール準拠。

---

## 禁止事項・注意点

### シークレット取り扱い（グローバル §4 参照）

**エージェント稼働中に `.dev.vars` / `.env` 等のシークレットファイルを Read / Edit しない**。2026-04-19 の pokerops 事故（OpenAI + Anthropic キー漏洩 → revoke → 2 日で連鎖 revoke）を繰り返さない：

1. キー発行はダッシュボード側で
2. env ファイル編集は必ずエージェントのセッションを終了した後の独立 Git Bash で
3. エージェント再起動後はそのファイルを触らない
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

### Supabase free-tier の auto-pause（運用注意 2026-07-05）

本番 Supabase は free-tier のため **7 日間アクセスが無いとプロジェクトが自動停止**し、`/morning` 等の API が 500 を返す。**API が突然 500 になったら真っ先にこれを疑う**（コードのバグではない可能性が高い）。
- **復旧**: Supabase ダッシュボード（ref `piuthseepzqggkrdsdyd`）で **Resume** を押すだけ。CLI/API には unpause サブコマンドが無く**ダッシュボード操作が唯一のルート**
- **恒久策は未決**（Pro 化 or 毎朝の agent 実行で自然回避）。inbox に「free-tier 再 pause 対策」TODO あり

### 完了済み・実装ログ → `docs/implementation-log.md`

Phase 0〜2 完了・チャット・アーカイブページ・Input v2 等の実装記録は `docs/implementation-log.md` に分離（2026-07-03）。**既存機能に触る前に該当セクションを読む。新規実装の記録もそちらへ追記。**

---

## 関連ファイル・リンク

- `~/.codex/AGENTS.md §2` — プロジェクト棚卸し（Synapse もこの表に載っている）
- `~/work/AGENTS.md` — concierge モード定義（Synapse も concierge 把握対象）
- `C:/Users/chiba/vault/projects/status.md` — Synapse セクションがある
- `C:/Users/chiba/.claude/plans/deep-forging-stream.md` — このディレクトリを作った計画書（2026-04-24）

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
