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
