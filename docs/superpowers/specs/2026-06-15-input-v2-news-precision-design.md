# Input v2 — ニュース精度刷新 設計書

- 日付: 2026-06-15
- 対象 Phase: Phase 2 の改善（外部脳サブプロジェクト #1）
- ステータス: 設計確定（実装計画は別途 writing-plans で作成）

## 1. 背景・問題

現状の `scripts/synapse-agent/collect.ts` は外部脳の Input 層 v1。以下の理由で「抽象的・刺さらない」：

- **X が既定 OFF**（`ENABLE_X_SEARCH` 未設定）。実質 RSS 8本 + GitHub releases だけが情報源。
- **関心の軸がゼロ**。RSS 全件を無差別に要約・保存している（`feed_items` に全部入る）。
- **クエリが汎用**（`"Claude Code" update 2026` 等）でターゲティングされていない。

欲しいのは具体トピックに刺さる情報：model deprecation / 主流ツール / Claude Code tips / SpaceX / Neuralink / Physical AI / Tesla FSD 等。情報源は **X をメイン**にする。

## 2. ゴール・成功基準

- `/morning` を開いたとき、**上位に「自分の興味に刺さる」カードが並ぶ**。
- X が主たる情報源として機能する（既定 ON、トピック単位で収集）。
- 無関係な RSS ノイズが入口で間引かれ、フィードが軽くなる。

## 3. 確定した設計判断（brainstorm 2026-06-15）

| 論点 | 決定 |
|---|---|
| X 収集方式 | **フォロー垢ベース**（高信号アカウント主軸） |
| X アイテム粒度 | **トピック別ダイジェスト**（個別ツイート埋め込みは諦める） |
| トピック/垢の管理 | **設定ファイル `sources.ts` に直書き**（二人共通の関心セット） |
| スコアの使い方 | **閾値で間引き＋スコア順表示** |

### 制約（技術的事実）

`mcp__hermes-x-search__x_search` は **自然言語クエリ → Grok が合成した要約文字列** を返すツール。個別ツイート配列（URL付き）は返さない。よって X 由来は「アカウント別の個別ツイート」ではなく「トピック別の要約ダイジェスト」になる。

agent（素の Node プロセス）から hermes-x-search（この Claude セッション内の MCP）へは直接到達できないため、**`spawnSync('claude', ['-p', ...])` でローカル Claude Code 越しに呼ぶ**現行方式を踏襲する。

## 4. アーキテクチャ

### 4.1 収集パイプライン（2 系統）

```
X 系統（メイン）
  sources.ts の TOPICS[] を順に処理
  各 topic について claude -p で「topic × accounts の最近の話題」を hermes-x-search に要約させる
  → トピック別ダイジェストカード 1 件
  → feed_items(source='x', topic=<name>, score=X_DIGEST_SCORE, summary=<Grok要約>)

RSS/GitHub 系統（補助）
  既存 RSS 8本 + GitHub releases を取得
  各 item を Haiku で「要約＋カテゴリ＋関心度スコア(0-100)」一括判定
  score < MIN_SCORE は保存せず破棄（入口で間引き）
  → feed_items(source='rss', score=N, topic=NULL)

→ /morning は score 降順（同点は created_at 降順）で表示
```

### 4.2 データモデル変更（新規マイグレ 1 本）

`supabase/migrations/<ts>_feed_score.sql`：

```sql
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS score INTEGER;   -- 0-100, NULL 可
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS topic TEXT;      -- X ダイジェストのトピック名、RSS は NULL
CREATE INDEX IF NOT EXISTS idx_feed_items_score ON feed_items(score DESC NULLS LAST, created_at DESC);
```

既存の `idx_feed_items_source_url`（UNIQUE WHERE source_url IS NOT NULL）は維持。

### 4.3 X ダイジェストの冪等性

source_url を合成キー `x-digest://<topic-slug>/<YYYY-MM-DD-JST>` にして既存 UNIQUE index を再利用 → **同トピック同日2回目は 409 skip**（cron は1日1回なので overwrite 不要）。

この合成 URL は外部リンクではないので、UI 側は **`http(s)` で始まる source_url のときだけリンク化**する（後述）。

### 4.4 sources.ts の新構造

```ts
// 興味トピック × 高信号アカウント（二人共通の関心セット）
export const TOPICS = [
  { name: 'Claude Code tips', accounts: ['@AnthropicAI', '...'], keywords: 'Claude Code 新機能 tips' },
  { name: 'Physical AI',       accounts: ['@...'],               keywords: 'physical AI humanoid robotics' },
  // model deprecation / SpaceX / Neuralink / Tesla FSD ...
];
```

`X_QUERIES`（旧・汎用クエリ）は廃止。`RSS_SOURCES` / `GITHUB_SOURCES` は維持。

### 4.5 スコアリング

- RSS/GitHub item は Haiku の classify 呼び出しを拡張し、既存 `summary`/`category`/`claude_runnable` に **`score`(0-100)** を追加（呼び出し回数は増やさない＝1記事1コール据え置き）。
- スコアの基準は「TOPICS の関心セットとの関連度」。プロンプトに TOPICS 名一覧を渡して判定させる。
- `MIN_SCORE`（env、既定 40）未満は保存しない。
- X ダイジェストは curated 済みなので Haiku を通さず固定スコア `X_DIGEST_SCORE`（env、既定 90）を付与し、フィード上位に来るようにする。

### 4.6 UI（`/morning`）変更

- API `/api/morning` の並び順を `created_at DESC` → **`score DESC NULLS LAST, created_at DESC`** に変更（cursor pagination はこの複合キーに合わせて調整）。
- `MorningFeed.tsx`:
  - source_url が `http(s)` で始まるときのみ title をリンク化（合成 `x-digest://` URL はプレーンテキスト）。
  - `topic` があればトピックバッジを表示。
  - （任意・軽量）score を控えめに表示。
- TweetEmbed の分岐（`source==='x' && extractTweetId`）は実ツイート URL のときだけ機能。ダイジェストは extractTweetId が NULL を返すのでテキストカードにフォールバックする（既存挙動を壊さない）。

## 5. テスト方針（vitest TDD）

`lib/archive.ts` と同様に**純粋ロジックを切り出して TDD**：

- `lib/feed-ingest.ts`（新規・純粋関数）に以下を置く：
  - スコア閾値フィルタ（item[] + minScore → 残す item[]）
  - X ダイジェストの合成 source_url 生成（topic + JST date → `x-digest://...`）
  - JST 日付変換（既存 `lib/archive.ts` の JST ヘルパを再利用 or 共通化）
  - Haiku 応答 JSON のパース＋バリデーション（不正時フォールバック）
- ネットワーク I/O（fetch / spawnSync / Supabase）は純粋関数の外に置き、テスト対象にしない。

CF Pages ビルド保護のため `tsconfig` の test 除外（`**/*.test.ts`）は既存設定を踏襲。

## 6. スコープ外（YAGNI）

- 個別ツイートの正確な取得（X API 直接利用）— 将来必要なら別途。
- トピック/垢の DB 化・管理 UI・ユーザ別関心 — 当面 sources.ts 直書きで運用。
- score の手動上書き・学習（クリック履歴からの関心学習）等。

## 7. 影響ファイル

- 新規: `supabase/migrations/<ts>_feed_score.sql`, `lib/feed-ingest.ts`, `lib/feed-ingest.test.ts`
- 改修: `scripts/synapse-agent/collect.ts`, `scripts/synapse-agent/sources.ts`, `app/api/morning/route.ts`, `app/morning/MorningFeed.tsx`, `app/morning/types.ts`
- 参考（要確認）: `lib/anthropic.ts`（classify の score 拡張を web 側にも反映するか）
