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
