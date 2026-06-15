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
  it('+09:00 オフセット付きタイムスタンプも通る', () => {
    expect(decodeFeedCursor('90|2026-06-15T10:00:00.123456+09:00'))
      .toEqual({ score: 90, createdAt: '2026-06-15T10:00:00.123456+09:00' });
  });
  it('PostgREST フィルタ injection を弾く（カンマ/括弧/空白を含む createdAt は null）', () => {
    expect(decodeFeedCursor('0|x),or(id.not.is.null')).toBeNull();
    expect(decodeFeedCursor('0|2026-06-15T00:00:00Z,or(id.gt.0)')).toBeNull();
    expect(decodeFeedCursor('0|not a timestamp')).toBeNull();
  });
});
