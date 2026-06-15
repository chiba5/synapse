# Input v2 — ニュース精度刷新 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/morning` の AI ニュースを「X トピック別ダイジェスト＋関心度スコア間引き」で刷新し、上位に刺さるカードが並ぶようにする。

**Architecture:** 収集 agent（`scripts/synapse-agent/collect.ts`）を 2 系統に分ける。X 系統は `sources.ts` の TOPICS を hermes-x-search（`claude -p` 経由）でトピック別ダイジェスト化。RSS/GitHub 系統は Haiku で関心度スコア(0-100)を付け、閾値未満を破棄。`feed_items` に `score`/`topic` 列を足し、`/morning` を score 降順のキーセット pagination に変更。純粋ロジックは `lib/feed-ingest.ts` に集約し vitest で TDD（agent からは相対 import）。

**Tech Stack:** Next.js 15 App Router (Edge runtime) / Supabase (PostgREST) / vitest / tsx (agent) / Anthropic API (Haiku) / hermes-x-search MCP

**設計書:** `docs/superpowers/specs/2026-06-15-input-v2-news-precision-design.md`

---

## ファイル構成

| ファイル | 責務 | 操作 |
|---|---|---|
| `supabase/migrations/20260615120000_feed_score.sql` | `feed_items` に score/topic 列＋index | 新規 |
| `scripts/synapse-agent/ingest-logic.ts` | agent 用純粋ロジック（classify パース・閾値・digest URL・slug・JST） | 新規 |
| `scripts/synapse-agent/ingest-logic.test.ts` | 上記の vitest | 新規 |
| `lib/feed-ingest.ts` | web 用純粋ロジック（cursor 符号化／復元） | 新規 |
| `lib/feed-ingest.test.ts` | 上記の vitest | 新規 |
| `vitest.config.ts` | include に agent のテストを追加 | 改修 |
| `scripts/synapse-agent/sources.ts` | TOPICS（興味×垢）定義、X_QUERIES 廃止 | 改修 |
| `scripts/synapse-agent/collect.ts` | 2 系統収集・スコア付与・閾値間引き・ダイジェスト | 改修 |
| `app/api/morning/route.ts` | score 降順キーセット pagination | 改修 |
| `app/morning/page.tsx` | 初期データを score 降順に | 改修 |
| `app/morning/types.ts` | FeedItem に score/topic 追加 | 改修 |
| `app/morning/MorningFeed.tsx` | topic バッジ・http(s) のみリンク化・score 表示 | 改修 |

---

## Task 1: DB マイグレーション（score / topic 列）

**Files:**
- Create: `supabase/migrations/20260615120000_feed_score.sql`

- [ ] **Step 1: マイグレーションファイルを作成**

```sql
-- Input v2: 関心度スコア + X ダイジェストのトピック列
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS topic TEXT;

-- source CHECK は既存のまま（'x','rss','web_search'）。X ダイジェストも source='x' を使う。

-- score 降順表示のための複合インデックス
CREATE INDEX IF NOT EXISTS idx_feed_items_score
  ON feed_items(score DESC, created_at DESC);
```

- [ ] **Step 2: Supabase に適用**

ダッシュボードの SQL Editor（または `supabase db push`）でこの SQL を実行する。**シークレットを含まないので Claude が SQL 文を提示し、ユーザが適用する**。適用後 `feed_items` に `score`(int, default 0) と `topic`(text, null) が増えていることを確認。

Run（確認、psql 利用可能な場合のみ・任意）: `\d feed_items`
Expected: `score | integer | not null | default 0` と `topic | text` の行が見える。

- [ ] **Step 3: コミット**

```bash
git add supabase/migrations/20260615120000_feed_score.sql
git commit -m "feat(input-v2): feed_items に score/topic 列とインデックスを追加"
```

---

## Task 2: 純粋ロジック 2 モジュール（TDD）

agent 用と web 用は消費者が分離しているので 2 モジュールに分ける。両方とも純粋関数（ネットワーク I/O を含めない）。vitest の include を agent 側にも広げて両方を1つの runner で回す。

**Files:**
- Modify: `vitest.config.ts`
- Create: `scripts/synapse-agent/ingest-logic.ts`（agent 用）
- Test: `scripts/synapse-agent/ingest-logic.test.ts`
- Create: `lib/feed-ingest.ts`（web 用）
- Test: `lib/feed-ingest.test.ts`

- [ ] **Step 1: vitest.config.ts の include を広げる**

`vitest.config.ts` の `include` を変更:

```ts
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'scripts/synapse-agent/**/*.test.ts'],
  },
```

（CF Pages ビルドは `tsconfig` の `exclude` に `**/*.test.ts` と `scripts/synapse-agent` が既にあるので影響なし。）

- [ ] **Step 2: agent 用テストを書く（失敗するはず）**

`scripts/synapse-agent/ingest-logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseClassification,
  passesThreshold,
  slugifyTopic,
  digestSourceUrl,
  toJstDate,
} from './ingest-logic';

describe('parseClassification', () => {
  it('正常な JSON を構造体にする', () => {
    const text = '{"summary":"要約だ","category":"practical","claude_runnable":true,"score":80}';
    expect(parseClassification(text, 'fallback title')).toEqual({
      summary: '要約だ', category: 'practical', claude_runnable: true, score: 80,
    });
  });
  it('前後に余計なテキストがあっても最初の JSON を拾う', () => {
    const text = 'はい:\n{"summary":"s","category":"knowledge","claude_runnable":false,"score":30}\n以上';
    expect(parseClassification(text, 'ft').score).toBe(30);
  });
  it('不正な category は knowledge にフォールバック', () => {
    const text = '{"summary":"s","category":"bogus","claude_runnable":false,"score":50}';
    expect(parseClassification(text, 'ft').category).toBe('knowledge');
  });
  it('score を 0-100 にクランプ', () => {
    expect(parseClassification('{"summary":"s","category":"knowledge","claude_runnable":false,"score":150}', 'ft').score).toBe(100);
    expect(parseClassification('{"summary":"s","category":"knowledge","claude_runnable":false,"score":-5}', 'ft').score).toBe(0);
  });
  it('パース不能ならフォールバック（score 0・title を summary に）', () => {
    expect(parseClassification('not json', 'タイトル')).toEqual({
      summary: 'タイトル', category: 'knowledge', claude_runnable: false, score: 0,
    });
  });
});

describe('passesThreshold', () => {
  it('閾値以上は true', () => {
    expect(passesThreshold(40, 40)).toBe(true);
    expect(passesThreshold(41, 40)).toBe(true);
  });
  it('閾値未満は false', () => {
    expect(passesThreshold(39, 40)).toBe(false);
  });
});

describe('slugifyTopic', () => {
  it('英数字小文字とハイフンに正規化', () => {
    expect(slugifyTopic('Claude Code tips')).toBe('claude-code-tips');
    expect(slugifyTopic('Physical AI / Robotics')).toBe('physical-ai-robotics');
  });
});

describe('digestSourceUrl', () => {
  it('topic と JST 日付から合成キーを作る', () => {
    expect(digestSourceUrl('Claude Code tips', '2026-06-15')).toBe('x-digest://claude-code-tips/2026-06-15');
  });
});

describe('toJstDate', () => {
  it('UTC を +9h して YYYY-MM-DD', () => {
    expect(toJstDate('2026-06-15T16:00:00.000Z')).toBe('2026-06-16'); // JST 01:00 翌日
    expect(toJstDate('2026-06-15T00:00:00.000Z')).toBe('2026-06-15');
  });
});
```

- [ ] **Step 3: agent 用実装を書く**

`scripts/synapse-agent/ingest-logic.ts`（自己完結・他ファイルを import しない）:

```ts
// agent 用 Input v2 純粋ロジック（ネットワーク I/O 無し・vitest 対象）

export type FeedClassification = {
  summary: string;
  category: 'practical' | 'knowledge' | 'claude_runnable';
  claude_runnable: boolean;
  score: number; // 0-100
};

const VALID_CATEGORIES = ['practical', 'knowledge', 'claude_runnable'] as const;

function clampScore(n: unknown): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

/** Haiku 応答文字列から最初の JSON を取り出し分類結果に。失敗時は安全側フォールバック。 */
export function parseClassification(text: string, fallbackTitle: string): FeedClassification {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('no json');
    const parsed = JSON.parse(match[0]);
    const category = VALID_CATEGORIES.includes(parsed.category) ? parsed.category : 'knowledge';
    return {
      summary: String(parsed.summary ?? fallbackTitle),
      category,
      claude_runnable: Boolean(parsed.claude_runnable),
      score: clampScore(parsed.score),
    };
  } catch {
    return { summary: fallbackTitle, category: 'knowledge', claude_runnable: false, score: 0 };
  }
}

export function passesThreshold(score: number, minScore: number): boolean {
  return score >= minScore;
}

export function slugifyTopic(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** X ダイジェストの冪等キー（既存 UNIQUE index 再利用のための合成 source_url）。jstDate は 'YYYY-MM-DD'。 */
export function digestSourceUrl(topicName: string, jstDate: string): string {
  return `x-digest://${slugifyTopic(topicName)}/${jstDate}`;
}

/** UTC ISO を JST(+9h) の 'YYYY-MM-DD' に。lib/archive.ts の同名関数と同等（agent 境界のため複製）。 */
export function toJstDate(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
```

- [ ] **Step 4: web 用テストを書く（失敗するはず）**

`lib/feed-ingest.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { encodeFeedCursor, decodeFeedCursor } from './feed-ingest';

describe('feed cursor', () => {
  it('encode → decode で往復する', () => {
    const c = encodeFeedCursor(80, '2026-06-15T01:02:03.000Z');
    expect(decodeFeedCursor(c)).toEqual({ score: 80, createdAt: '2026-06-15T01:02:03.000Z' });
  });
  it('score 0 も往復する', () => {
    expect(decodeFeedCursor(encodeFeedCursor(0, '2026-06-15T00:00:00.000Z')))
      .toEqual({ score: 0, createdAt: '2026-06-15T00:00:00.000Z' });
  });
  it('不正な cursor は null', () => {
    expect(decodeFeedCursor('garbage')).toBeNull();
    expect(decodeFeedCursor(null)).toBeNull();
  });
});
```

- [ ] **Step 5: web 用実装を書く**

`lib/feed-ingest.ts`:

```ts
// web 用 Input v2 純粋ロジック（cursor 符号化／復元・vitest 対象）

/** score 降順 + created_at 降順のキーセット cursor を文字列化。 */
export function encodeFeedCursor(score: number, createdAt: string): string {
  return `${score}|${createdAt}`;
}

export function decodeFeedCursor(cursor: string | null): { score: number; createdAt: string } | null {
  if (!cursor) return null;
  const idx = cursor.indexOf('|');
  if (idx < 0) return null;
  const score = Number(cursor.slice(0, idx));
  const createdAt = cursor.slice(idx + 1);
  if (!Number.isFinite(score) || !createdAt) return null;
  return { score, createdAt };
}
```

- [ ] **Step 6: 両方のテストが通ることを確認＋既存回帰**

Run: `npx vitest run`
Expected: PASS（archive 16 + ingest-logic 14+ + feed-ingest 3 が緑）。失敗していた2モジュールが緑に変わる。

- [ ] **Step 7: コミット**

```bash
git add vitest.config.ts scripts/synapse-agent/ingest-logic.ts scripts/synapse-agent/ingest-logic.test.ts lib/feed-ingest.ts lib/feed-ingest.test.ts
git commit -m "feat(input-v2): agent/web の純粋ロジックを分離し vitest で TDD"
```

---

## Task 3: sources.ts — TOPICS 構造への刷新

**Files:**
- Modify: `scripts/synapse-agent/sources.ts`

- [ ] **Step 1: TOPICS を追加し X_QUERIES を削除**

`scripts/synapse-agent/sources.ts` を以下に置き換える（`RSS_SOURCES` / `GITHUB_SOURCES` は維持、`X_QUERIES` を `TOPICS` に置換）:

```ts
// RSS / Atom フィード（vault/ai-digest/sources.md から移植 2026-05-20）
export const RSS_SOURCES = [
  { name: 'Simon Willison',      url: 'https://simonwillison.net/atom/everything/' },
  { name: 'Zenn: Claude Code',   url: 'https://zenn.dev/topics/claudecode/feed' },
  { name: 'Latent Space',        url: 'https://www.latent.space/feed' },
  { name: 'Hugging Face Blog',   url: 'https://huggingface.co/blog/feed.xml' },
  { name: 'Import AI',           url: 'https://importai.substack.com/feed' },
  { name: 'Ahead of AI',         url: 'https://magazine.sebastianraschka.com/feed' },
  { name: 'Zenn: LLM',           url: 'https://zenn.dev/topics/llm/feed' },
  { name: 'Zenn: Generative AI', url: 'https://zenn.dev/topics/generativeai/feed' },
];

// GitHub JSON API
export const GITHUB_SOURCES = [
  { name: 'Claude Code Releases', url: 'https://api.github.com/repos/anthropics/claude-code/releases' },
];

// 興味トピック × 高信号アカウント（二人共通の関心セット）。
// hermes-x-search 用。accounts/keywords は運用で随時 sources.ts を直接編集して調整する（初期 seed）。
export type Topic = { name: string; accounts: string[]; keywords: string };

export const TOPICS: Topic[] = [
  { name: 'Claude Code tips',          accounts: ['@AnthropicAI'],                 keywords: 'Claude Code 新機能 tips workflow subagent skill' },
  { name: 'Model deprecation/release', accounts: ['@AnthropicAI', '@OpenAI', '@GoogleDeepMind'], keywords: 'LLM model release deprecation new model frontier' },
  { name: 'Physical AI / Humanoid',    accounts: ['@Figure_robot', '@Tesla_Optimus'], keywords: 'physical AI humanoid robot embodied' },
  { name: 'SpaceX',                    accounts: ['@SpaceX', '@elonmusk'],         keywords: 'SpaceX Starship launch' },
  { name: 'Neuralink',                 accounts: ['@neuralink'],                   keywords: 'Neuralink brain computer interface implant' },
  { name: 'Tesla FSD',                 accounts: ['@Tesla', '@elonmusk'],          keywords: 'Tesla FSD full self driving autonomy' },
];
```

- [ ] **Step 2: 旧 import の参照が壊れていないか確認**

Run: `cd scripts/synapse-agent && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: `X_QUERIES` 未定義エラーが collect.ts に出る（Task 4 で解消する想定。この時点ではエラーが出てよい）。

- [ ] **Step 3: コミット**

```bash
git add scripts/synapse-agent/sources.ts
git commit -m "feat(input-v2): sources.ts に TOPICS を導入し汎用 X_QUERIES を廃止"
```

---

## Task 4: collect.ts — RSS/GitHub のスコア付与＋閾値間引き

**Files:**
- Modify: `scripts/synapse-agent/collect.ts`

- [ ] **Step 1: import とenv と型を更新**

`collect.ts` 冒頭の import を変更:

```ts
import { spawnSync } from 'child_process';
import { XMLParser } from 'fast-xml-parser';
import { RSS_SOURCES, GITHUB_SOURCES, TOPICS } from './sources.js';
import {
  parseClassification,
  passesThreshold,
  digestSourceUrl,
  toJstDate,
  type FeedClassification,
} from './ingest-logic.js';
```

env 定数に追加（既存の `ENABLE_X_SEARCH` 行の近く）:

```ts
const MIN_SCORE = parseInt(process.env.MIN_SCORE ?? '40', 10);
const X_DIGEST_SCORE = parseInt(process.env.X_DIGEST_SCORE ?? '90', 10);
```

既存の `type Classification` と `Classification['category']` 参照は `FeedClassification` に統一する（型の重複定義を消す）。`IngestItem` 型に `topic?: string` と `score?: number` を追加:

```ts
type IngestItem = {
  source: 'rss' | 'web_search' | 'x';
  source_url?: string;
  title: string;
  body?: string;
  topic?: string;
  score?: number;
};
```

- [ ] **Step 2: classify を score 対応に差し替える**

既存の `classify` 関数本体を、TOPICS を渡しスコアも返すプロンプトに置き換える:

```ts
async function classify(item: IngestItem): Promise<FeedClassification> {
  const excerpt = (item.body ?? '').slice(0, 500);
  const topicList = TOPICS.map(t => t.name).join(' / ');
  const prompt = `以下のAI・技術ニュース記事を日本語で2〜3文に要約し、カテゴリと「関心度スコア」を判定してください。

関心トピック（このどれかに近いほど高スコア）: ${topicList}

タイトル: ${item.title}
URL: ${item.source_url ?? 'N/A'}
本文（抜粋）: ${excerpt}

以下のJSONのみ返してください（他のテキスト不要）:
{"summary":"2〜3文の日本語要約","category":"practical|knowledge|claude_runnable","claude_runnable":true|false,"score":0〜100の整数}

カテゴリ定義:
- practical: 実務・開発ですぐ使える（APIリリース、ツール公開など）
- claude_runnable: Claude Codeで今すぐ試せる実装例・コード・機能
- knowledge: 知識・トレンド・研究として知っておくべき内容

スコア定義: 関心トピックに具体的に刺さるほど高く、無関係・抽象的なほど低く。`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    return { summary: item.title, category: 'knowledge', claude_runnable: false, score: 0 };
  }

  const data = await res.json() as { content: Array<{ type: string; text: string }> };
  const text = data.content?.[0]?.type === 'text' ? data.content[0].text : '';
  return parseClassification(text, item.title);
}
```

- [ ] **Step 3: upsertItem を score/topic 対応にする**

`upsertItem` の `record` に `score` と `topic` を追加:

```ts
async function upsertItem(item: IngestItem, cl: FeedClassification): Promise<'saved' | 'skipped' | 'error'> {
  const record = {
    source: item.source,
    source_url: item.source_url ?? null,
    title: item.title,
    body: item.body ?? null,
    summary: cl.summary,
    category: cl.category,
    claude_runnable: cl.claude_runnable,
    score: item.score ?? cl.score,
    topic: item.topic ?? null,
  };
  // （以降の fetch/409 ハンドリングは既存のまま）
```

（`fetch` 〜 `return 'saved'` の部分は変更なし。）

- [ ] **Step 4: runCollect の RSS/GitHub ループに閾値間引きを入れる**

`runCollect` 内、`deduped` を classify→upsert するループを以下に変更（閾値未満を skip し、X は別系統で別途処理するので「source !== 'x' のものだけここで classify」する）:

```ts
  let saved = 0, skipped = 0, failed = 0, dropped = 0;
  for (const item of deduped) {
    try {
      const cl = await classify(item);
      if (!passesThreshold(cl.score, MIN_SCORE)) {
        dropped++;
        continue; // 閾値未満は保存しない（入口で間引き）
      }
      const result = await upsertItem(item, cl);
      if (result === 'saved') saved++;
      else if (result === 'skipped') skipped++;
      else failed++;
    } catch (e) {
      console.warn(`  [error] "${item.title.slice(0, 40)}": ${String(e)}`);
      failed++;
    }
  }

  console.log(`[collect] RSS/GitHub Done — saved=${saved} skipped=${skipped} dropped=${dropped} failed=${failed}`);
```

注: この時点で `deduped` には RSS/GitHub のみ入る（X は Task 5 で別系統に分離するため、既存の X 収集ブロックは Task 5 で置き換える）。

- [ ] **Step 5: 型チェック**

Run: `cd scripts/synapse-agent && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: X 系統（旧 `searchX` / `ENABLE_X_SEARCH` / `X_QUERIES`）に関するエラーのみ残る（Task 5 で解消）。score/classify 周りのエラーは無いこと。

- [ ] **Step 6: コミット**

```bash
git add scripts/synapse-agent/collect.ts
git commit -m "feat(input-v2): RSS/GitHub に関心度スコア付与＋閾値間引きを実装"
```

---

## Task 5: collect.ts — X トピック別ダイジェスト収集

**Files:**
- Modify: `scripts/synapse-agent/collect.ts`

- [ ] **Step 1: 旧 searchX を topic-digest 関数に置き換える**

`collect.ts` の `searchX` 関数を削除し、以下の `collectTopicDigest` に置き換える:

```ts
/** 1 トピックを hermes-x-search（claude -p 経由）で日本語ダイジェスト化する。失敗・空なら null。 */
function collectTopicDigest(topic: { name: string; accounts: string[]; keywords: string }): IngestItem | null {
  const accounts = topic.accounts.join(' ');
  const prompt =
    `hermes-x-search ツールを使い、直近48時間の X 投稿から「${topic.keywords}」に関する` +
    `具体的で重要な動きを調べてください（特に ${accounts} の発言を重視）。\n` +
    `結果を日本語で 3〜5 個の箇条書きダイジェストにまとめ、ダイジェスト本文のみ出力してください` +
    `（前置き・後書き・JSON 不要）。該当が無ければ "NONE" とだけ出力してください。`;

  const result = spawnSync('claude', ['-p', prompt], {
    shell: true,
    encoding: 'utf-8',
    timeout: 60_000,
  });

  if (result.error || result.status !== 0) {
    console.warn(`  [x] "${topic.name}" spawn error:`, result.stderr?.slice(0, 200));
    return null;
  }

  const digest = (result.stdout ?? '').trim();
  if (!digest || digest === 'NONE' || digest.length < 20) return null;

  const jstDate = toJstDate(new Date().toISOString()); // 'YYYY-MM-DD'
  return {
    source: 'x',
    source_url: digestSourceUrl(topic.name, jstDate),
    title: `【X】${topic.name}`,
    body: null ?? undefined,
    topic: topic.name,
    score: X_DIGEST_SCORE,
  };
}
```

- [ ] **Step 2: runCollect の X 収集ブロックを書き換える**

`runCollect` 内の旧 X ブロック（`if (!ENABLE_X_SEARCH) {...}` と `for (const query of ...X_QUERIES...)`）を削除し、RSS/GitHub 収集の後・dedup の前に以下を挿入する。**X ダイジェストは classify を通さず（curated 済み）、専用の summary を持たせて直接 upsert する**ので、`all`（=RSS/GitHub 用）には混ぜず別ループにする:

`runCollect` の構造を次のようにする（要点のみ。RSS/GitHub の収集→dedup→classify ループは Task 4 のまま）:

```ts
export async function runCollect() {
  console.log(`[collect] Starting — ${new Date().toISOString()}`);

  // ---- 1) X トピック別ダイジェスト（メイン系統・classify を通さない）----
  let xSaved = 0, xSkipped = 0, xFailed = 0;
  for (const topic of TOPICS) {
    const item = collectTopicDigest(topic);
    if (!item) { console.log(`  [x] ${topic.name}: no digest`); continue; }
    // ダイジェストは summary に本文を入れる（classify 不要）
    const cl: FeedClassification = {
      summary: item.body ?? '', // body には未格納。下の upsert で summary を使うため digest を summary に入れる
      category: 'knowledge',
      claude_runnable: false,
      score: item.score ?? X_DIGEST_SCORE,
    };
    try {
      const result = await upsertItem(item, cl);
      if (result === 'saved') { xSaved++; console.log(`  [x] ${topic.name}: saved`); }
      else if (result === 'skipped') xSkipped++;
      else xFailed++;
    } catch (e) {
      console.warn(`  [x] ${topic.name} upsert error: ${String(e)}`);
      xFailed++;
    }
  }
  console.log(`[collect] X digests — saved=${xSaved} skipped=${xSkipped} failed=${xFailed}`);

  // ---- 2) RSS / GitHub（補助系統・スコア間引き）----
  const all: IngestItem[] = [];
  for (const src of RSS_SOURCES) {
    try {
      const items = await fetchRss(src.url);
      console.log(`  [rss] ${src.name}: ${items.length} items`);
      all.push(...items);
    } catch (e) {
      console.warn(`  [rss] ${src.name} failed:`, String(e));
    }
  }
  for (const src of GITHUB_SOURCES) {
    try {
      const items = await fetchGithub(src.url);
      console.log(`  [github] ${src.name}: ${items.length} items`);
      all.push(...items);
    } catch (e) {
      console.warn(`  [github] ${src.name} failed:`, String(e));
    }
  }

  // URL 重複除去（RSS/GitHub のみ）
  const seen = new Set<string>();
  const deduped = all.filter(item => {
    if (!item.source_url) return true;
    if (seen.has(item.source_url)) return false;
    seen.add(item.source_url);
    return true;
  });

  console.log(`[collect] RSS/GitHub ${all.length} raw → ${deduped.length} unique`);

  let saved = 0, skipped = 0, failed = 0, dropped = 0;
  for (const item of deduped) {
    try {
      const cl = await classify(item);
      if (!passesThreshold(cl.score, MIN_SCORE)) { dropped++; continue; }
      const result = await upsertItem(item, cl);
      if (result === 'saved') saved++;
      else if (result === 'skipped') skipped++;
      else failed++;
    } catch (e) {
      console.warn(`  [error] "${item.title.slice(0, 40)}": ${String(e)}`);
      failed++;
    }
  }
  console.log(`[collect] RSS/GitHub Done — saved=${saved} skipped=${skipped} dropped=${dropped} failed=${failed}`);
}
```

**重要な修正点（digest 本文の扱い）:** ダイジェスト本文を `summary` に格納する必要がある。`collectTopicDigest` の戻り値で `body` でなく専用フィールドに digest を持たせると分かりにくいので、`collectTopicDigest` は digest 文字列を `summary` として返す形に統一する。Step 3 で確定する。

- [ ] **Step 3: collectTopicDigest の戻り値を summary 起点に修正**

`collectTopicDigest` の return と、上の X ループでの `cl.summary` を整合させる。`IngestItem` には `summary` フィールドが無いので、`collectTopicDigest` は `{ item, digest }` を返す形にして曖昧さを消す:

```ts
function collectTopicDigest(topic: { name: string; accounts: string[]; keywords: string }):
  { item: IngestItem; digest: string } | null {
  // ...spawnSync 部分は Step 1 と同じ...
  const digest = (result.stdout ?? '').trim();
  if (!digest || digest === 'NONE' || digest.length < 20) return null;

  const jstDate = toJstDate(new Date().toISOString());
  const item: IngestItem = {
    source: 'x',
    source_url: digestSourceUrl(topic.name, jstDate),
    title: `【X】${topic.name}`,
    topic: topic.name,
    score: X_DIGEST_SCORE,
  };
  return { item, digest };
}
```

X ループ側を修正:

```ts
  for (const topic of TOPICS) {
    const res = collectTopicDigest(topic);
    if (!res) { console.log(`  [x] ${topic.name}: no digest`); continue; }
    const cl: FeedClassification = {
      summary: res.digest,
      category: 'knowledge',
      claude_runnable: false,
      score: X_DIGEST_SCORE,
    };
    try {
      const result = await upsertItem(res.item, cl);
      if (result === 'saved') { xSaved++; console.log(`  [x] ${topic.name}: saved`); }
      else if (result === 'skipped') xSkipped++;
      else xFailed++;
    } catch (e) {
      console.warn(`  [x] ${topic.name} upsert error: ${String(e)}`);
      xFailed++;
    }
  }
```

- [ ] **Step 4: 型チェックがクリーンに通ることを確認**

Run: `cd scripts/synapse-agent && npx tsc --noEmit -p tsconfig.json 2>&1 | head -30`
Expected: エラー無し（出力が空）。`ENABLE_X_SEARCH` / `searchX` / `X_QUERIES` の残骸が無いことを確認。

- [ ] **Step 5: ドライ実行（手動・任意）**

ユーザの独立ターミナルで `.env.local` を読ませて 1 回実行し、X ダイジェストが 1 件以上 saved になることを確認（Claude/agent からは dev サーバ同様 spawn が刈られ得るので**ユーザ実行推奨**）:

Run（ユーザ）: `cd scripts/synapse-agent && npm run collect`
Expected: ログに `[x] <topic>: saved` が複数、`[collect] X digests — saved=N` の N≥1。

- [ ] **Step 6: コミット**

```bash
git add scripts/synapse-agent/collect.ts
git commit -m "feat(input-v2): X をトピック別ダイジェスト収集に刷新（hermes-x-search）"
```

---

## Task 6: /api/morning — score 降順キーセット pagination

**Files:**
- Modify: `app/api/morning/route.ts`

- [ ] **Step 1: select と order と cursor を score 複合キーに変更**

`route.ts` の `GET` を以下に変更（`decodeFeedCursor` / `encodeFeedCursor` を使う）:

```ts
import { getAuth } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase';
import { decodeFeedCursor, encodeFeedCursor } from '@/lib/feed-ingest';

export const runtime = 'edge';

export async function GET(req: Request) {
  const auth = await getAuth();
  if (!auth) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') ?? '20'), 50);
  const cursor = decodeFeedCursor(searchParams.get('cursor'));

  const db = getServiceClient();

  let query = db
    .from('feed_items')
    .select('id, source, source_url, title, body, summary, category, claude_runnable, score, topic, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit + 1);

  // キーセット: (score < S) OR (score = S AND created_at < C)
  if (cursor) {
    query = query.or(
      `score.lt.${cursor.score},and(score.eq.${cursor.score},created_at.lt.${cursor.createdAt})`
    );
  }

  const { data: rows, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const { data: reads } = await db
    .from('reads')
    .select('item_id')
    .eq('user_id', auth.profile.id)
    .eq('item_type', 'feed_item')
    .in('item_id', page.map(r => r.id));

  const readSet = new Set((reads ?? []).map(r => r.item_id));
  const data = page.map(r => ({ ...r, is_read: readSet.has(r.id) }));
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeFeedCursor(last.score, last.created_at) : null;

  return Response.json({ data, nextCursor });
}
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep -E "api/morning|feed-ingest" | head`
Expected: 出力無し（このファイル起因のエラーが無い）。

- [ ] **Step 3: 動作確認（dev・ヘッドレス/ curl）**

dev サーバが（ユーザ起動で）立っている前提で、`x-user-email` は middleware が付与するので curl で叩ける:

Run: `curl -s "http://localhost:3000/api/morning?limit=5" | head -c 600`
Expected: `data` 配列が score 降順（先頭が最大 score、X ダイジェストが上位）、`nextCursor` が `"90|2026-..."` 形式 or null。

- [ ] **Step 4: コミット**

```bash
git add app/api/morning/route.ts
git commit -m "feat(input-v2): /api/morning を score 降順キーセット pagination に変更"
```

---

## Task 7: app/morning/page.tsx — 初期データを score 降順に

**Files:**
- Modify: `app/morning/page.tsx`

- [ ] **Step 1: getInitialData の select/order と nextCursor を変更**

`encodeFeedCursor` を import し、`getInitialData` を変更:

import 追加:

```ts
import { encodeFeedCursor } from '@/lib/feed-ingest';
```

`select` に `score, topic` を追加、`.order('created_at', ...)` を score 複合に変更:

```ts
    const { data: rows, error } = await db
      .from('feed_items')
      .select('id, source, source_url, title, body, summary, category, claude_runnable, score, topic, created_at')
      .order('score', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE + 1);
```

`return` のマップに `score`/`topic` を追加し、`nextCursor` を変更:

```ts
    return {
      data: page.map(r => ({
        id: r.id as string,
        source: r.source as FeedItem['source'],
        source_url: (r.source_url ?? null) as string | null,
        title: r.title as string,
        body: (r.body ?? null) as string | null,
        summary: (r.summary ?? null) as string | null,
        category: (r.category ?? null) as FeedItem['category'],
        claude_runnable: Boolean(r.claude_runnable),
        score: Number(r.score ?? 0),
        topic: (r.topic ?? null) as string | null,
        created_at: r.created_at as string,
        is_read: readSet.has(r.id),
      })),
      nextCursor: hasMore
        ? encodeFeedCursor(Number(page[page.length - 1].score ?? 0), page[page.length - 1].created_at as string)
        : null,
    };
```

- [ ] **Step 2: 型チェック**

Run: `npx tsc --noEmit 2>&1 | grep "app/morning/page" | head`
Expected: 出力無し。

- [ ] **Step 3: コミット**

```bash
git add app/morning/page.tsx
git commit -m "feat(input-v2): /morning 初期データを score 降順に"
```

---

## Task 8: types.ts + MorningFeed.tsx — topic バッジ・リンク制御・score 表示

**Files:**
- Modify: `app/morning/types.ts`
- Modify: `app/morning/MorningFeed.tsx`

- [ ] **Step 1: FeedItem 型に score/topic を追加**

`app/morning/types.ts` の `FeedItem` に追加:

```ts
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
```

- [ ] **Step 2: MorningFeed のリンク化条件を http(s) 限定にし、topic バッジを足す**

`MorningFeed.tsx` のカード本文部分（`item.source === 'x' && ... TweetEmbed ... : ( <> ... </> )` の else 側）を以下に変更。`x-digest://` 合成 URL はリンクにしない:

タイトル描画部:

```tsx
                  <div>
                    {item.source_url && /^https?:\/\//.test(item.source_url) ? (
                      <a
                        href={item.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-sm font-semibold hover:underline"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <p className="text-sm font-semibold">{item.title}</p>
                    )}
                  </div>
```

バッジ行（`{item.category && (...)}` の直後）に topic バッジを追加:

```tsx
                  {item.topic && (
                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-sky-200 dark:border-sky-800">
                      {item.topic}
                    </span>
                  )}
```

（任意・軽量 score 表示）`<time>` の左に控えめに出す:

```tsx
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums" title="関心度スコア">
                  ★{item.score}
                </span>
```

- [ ] **Step 3: TweetEmbed 分岐が壊れないことを確認**

`item.source === 'x' && item.source_url && extractTweetId(item.source_url)` は `x-digest://` だと `extractTweetId` が null を返すので else 側（テキストカード）に落ちる。実ツイート URL のみ埋め込みになる。コード変更不要、確認のみ。

- [ ] **Step 4: 型チェック＋ビルド相当の確認**

Run: `npx tsc --noEmit 2>&1 | grep -E "MorningFeed|morning/types" | head`
Expected: 出力無し。

- [ ] **Step 5: 画面確認（ヘッドレス Chrome・1 コマンド）**

dev 起動中に（ユーザ起動）、`/morning` を撮影して X ダイジェストカード（topic バッジ・リンク無しタイトル）と score 順を目視:

Run: `chrome.exe --headless=new --disable-gpu --screenshot="C:/Users/chiba/work/synapse/tmp-morning.png" --window-size=480,1200 "http://localhost:3000/morning"`
Expected: スクショに topic バッジ付きカードが上位、★スコア表示。

- [ ] **Step 6: コミット**

```bash
git add app/morning/types.ts app/morning/MorningFeed.tsx
git commit -m "feat(input-v2): /morning に topic バッジ・score 表示・合成URLの非リンク化"
```

---

## Task 9: 最終検証＋ドキュメント反映

**Files:**
- Modify: `CLAUDE.md`（実装状況に Input v2 を追記）

- [ ] **Step 1: 全テスト緑を確認**

Run: `npx vitest run`
Expected: PASS（archive 16 + feed-ingest 12+）。

- [ ] **Step 2: 全体型チェック**

Run: `npx tsc --noEmit`
Expected: エラー無し。

- [ ] **Step 3: CLAUDE.md の「実装状況」に追記**

`CLAUDE.md` の「### 完了済み」付近に 1 行追加:

```
- **Input v2（ニュース精度刷新）**（2026-06-15・`feat/input-v2`）: X をトピック別ダイジェスト化（hermes-x-search、`sources.ts` の TOPICS×高信号垢、合成 source_url `x-digest://<topic>/<jst>` で冪等）＋RSS/GitHub に Haiku 関心度スコア(0-100)付与・`MIN_SCORE`(既定40)未満は入口で破棄。`feed_items` に `score`/`topic` 列追加（マイグレ `20260615120000_feed_score.sql`）。`/morning` は score 降順キーセット pagination（cursor=`score|created_at`）。純粋ロジックは `lib/feed-ingest.ts` に集約し vitest TDD。env: `MIN_SCORE`/`X_DIGEST_SCORE`(既定90)
```

- [ ] **Step 4: コミット**

```bash
git add CLAUDE.md
git commit -m "docs(input-v2): 実装状況に Input v2 を追記"
```

- [ ] **Step 5: ブランチ完了処理**

`superpowers:finishing-a-development-branch` を使い、master への merge / PR / cleanup を選ぶ。**本番反映前に Task 1 の SQL マイグレが Supabase に適用済みであること**を確認（未適用だと `/morning` の select が `score` 列で 500 になる）。

---

## Self-Review メモ

- **Spec coverage:** §4.1 2系統=Task4/5、§4.2 マイグレ=Task1、§4.3 冪等性=Task2(digestSourceUrl)+Task5、§4.4 sources=Task3、§4.5 スコアリング=Task4/5、§4.6 UI=Task6/7/8、§5 TDD=Task2。全カバー。
- **依存順:** Task1(DB)→Task2(純粋関数)→Task3(sources)→Task4/5(agent)→Task6/7(API/SSR)→Task8(UI)→Task9(検証)。Task6/7/8 は Task1 のマイグレ適用が前提（未適用だと 500）。
- **型整合:** `FeedClassification`（`scripts/synapse-agent/ingest-logic.ts` 定義）を agent の classify とダイジェストで共用。`encodeFeedCursor`/`decodeFeedCursor`（`lib/feed-ingest.ts`）は route.ts と page.tsx で同一シグネチャ。
- **境界設計:** agent と web で純粋ロジックを 2 モジュールに分離（消費者が分離しているため）。agent は `./ingest-logic.js`（自己完結、他ファイル import なし）のみ、web は `@/lib/feed-ingest` のみ。`../../lib` 跨ぎ import を作らないので agent tsconfig（`rootDir:"."`）でも型チェックが通る。`toJstDate` のみ 2 行重複するが境界を切るための許容コスト。
