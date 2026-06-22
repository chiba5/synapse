// web 用 Input v2 純粋ロジック（cursor 符号化／復元・vitest 対象）

/** score 降順 + created_at 降順のキーセット cursor を文字列化。 */
export function encodeFeedCursor(score: number, createdAt: string): string {
  return `${score}|${createdAt}`;
}

// createdAt は PostgREST の .or() フィルタに補間するため、ISO タイムスタンプ形式のみ許可する
// （クライアント供給の cursor 経由のフィルタ injection を防ぐ。archive ルートの .or() 衛生と同方針）。
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?$/;

export function decodeFeedCursor(cursor: string | null): { score: number; createdAt: string } | null {
  if (!cursor) return null;
  const idx = cursor.indexOf('|');
  if (idx < 0) return null;
  const score = Number(cursor.slice(0, idx));
  const createdAt = cursor.slice(idx + 1);
  if (!Number.isFinite(score) || !ISO_TIMESTAMP.test(createdAt)) return null;
  return { score, createdAt };
}
