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
