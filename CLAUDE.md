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

## Phase 分割（MVP → 差別化）

全部盛りで始めると完成しないので段階分割する。Phase 0 を 2 週間で出して毎日使ってみて、使用感で Phase 1 以降の優先順位を見直す流れ。

| Phase | 機能 | 狙い |
|---|---|---|
| **0** | 認証・日報投稿・note・既読 | 毎日触る最小面を作る |
| **1** | 雑多 inbox・タスク管理 | 運用定着 |
| **2** | AI ニュース自動収集（RSS/arxiv/HN/X → Claude API 要約） | 差別化機能の目玉 |
| **3** | 資料共有・週次 AI ダイジェスト（日報 + note を Claude で要約） | 長期運用効く層 |

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
- **AI ニュース cron**：Cloudflare Workers Cron Triggers + Anthropic SDK
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

## 実装状況（2026-04-25 時点）

### 完了済み
- **GitHub**: `chiba5/synapse` (private) 作成・push 済み
- **Cloudflare Pages**: `synapse-9dv.pages.dev` 稼働中（master push で自動ビルド）
- **CF Zero Trust / Access Application**: API 経由で作成済み
  - App ID: `e32c99a7-9038-492c-940a-a0e4f48d0a86`
  - AUD: `ae3c0c7fa44ea007aa64fe820627ac942f69c5e65d1ce05d77ab68e3eeb28934`
  - Policy: `chuangtaiqianye@gmail.com` Allow
- **CF Pages 環境変数**: `TEAM_DOMAIN` / `ACCESS_AUD` 設定済み（API 経由）
- **Supabase プロジェクト**: ref `piuthseepzqggkrdsdyd`（Tokyo）、初期 schema migration 適用済み
- **`.dev.vars`**: `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 設定済み（ローカルのみ）
- `npm run dev` で `http://localhost:3000` 正常表示確認済み

### 未完了
- **CF Pages に Supabase 環境変数追加**: ブラウザで CF Pages → `synapse` → Settings → Environment variables に `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` を追加（本番デプロイで必要）
- **Day 3**: 日報投稿・note・既読の実装（Phase 0 コア機能）
- **齋藤蓮 collaborator 招待**: CF Access に齋藤蓮のメールを追加（Day 8 以降）

---

## 関連ファイル・リンク

- `~/.claude/CLAUDE.md §2` — プロジェクト棚卸し（Synapse もこの表に載っている）
- `~/work/CLAUDE.md` — concierge モード定義（Synapse も concierge 把握対象）
- `C:/Users/chiba/vault/projects/status.md` — Synapse セクションがある
- `C:/Users/chiba/.claude/plans/deep-forging-stream.md` — このディレクトリを作った計画書（2026-04-24）
