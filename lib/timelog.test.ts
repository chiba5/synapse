import { describe, it, expect } from 'vitest';
import {
  isTimelogOwner,
  isValidDay,
  parseTimelogPayload,
  tableHeadline,
  extractStats,
  MAX_FIELD_CHARS,
} from './timelog';

describe('isTimelogOwner', () => {
  it('matches the owner email case-insensitively and ignores spaces', () => {
    expect(isTimelogOwner('Owner@Example.com', ' owner@example.com ')).toBe(true);
  });
  it('rejects another user', () => {
    expect(isTimelogOwner('other@example.com', 'owner@example.com')).toBe(false);
  });
  it('rejects everyone when the owner env is unset or empty', () => {
    expect(isTimelogOwner('owner@example.com', undefined)).toBe(false);
    expect(isTimelogOwner('owner@example.com', '  ')).toBe(false);
  });
  it('rejects a missing email', () => {
    expect(isTimelogOwner(null, 'owner@example.com')).toBe(false);
    expect(isTimelogOwner('', 'owner@example.com')).toBe(false);
  });
});

describe('isValidDay', () => {
  it('accepts a real YYYY-MM-DD date', () => {
    expect(isValidDay('2026-11-25')).toBe(true);
  });
  it('rejects malformed or impossible dates', () => {
    expect(isValidDay('2026-11-31')).toBe(false);
    expect(isValidDay('2026-2-01')).toBe(false);
    expect(isValidDay('2026-11-25x')).toBe(false);
    expect(isValidDay(20261125)).toBe(false);
  });
});

describe('parseTimelogPayload', () => {
  it('keeps only the fields that were sent', () => {
    const r = parseTimelogPayload({ day: '2026-11-25', table_md: '# t', summary_md: '# s' });
    expect(r).toEqual({ ok: true, value: { day: '2026-11-25', table_md: '# t', summary_md: '# s' } });
  });
  it('accepts diagnosis_html and drops null fields', () => {
    const r = parseTimelogPayload({ day: '2026-11-25', diagnosis_html: '<p>x</p>', table_md: null });
    expect(r).toEqual({ ok: true, value: { day: '2026-11-25', diagnosis_html: '<p>x</p>' } });
  });
  it('rejects a body that is not an object', () => {
    expect(parseTimelogPayload(null).ok).toBe(false);
    expect(parseTimelogPayload('x').ok).toBe(false);
  });
  it('rejects an invalid day', () => {
    expect(parseTimelogPayload({ day: '11/25', table_md: 'x' }).ok).toBe(false);
  });
  it('rejects a non-string field', () => {
    expect(parseTimelogPayload({ day: '2026-11-25', table_md: 1 }).ok).toBe(false);
  });
  it('rejects a payload with no content field', () => {
    expect(parseTimelogPayload({ day: '2026-11-25' }).ok).toBe(false);
  });
  it('rejects an oversized field', () => {
    const big = 'a'.repeat(MAX_FIELD_CHARS + 1);
    expect(parseTimelogPayload({ day: '2026-11-25', table_md: big }).ok).toBe(false);
  });
});

describe('tableHeadline', () => {
  it('returns the first heading without #', () => {
    expect(tableHeadline('# 11/25（水）何をしていたか\n本文')).toBe('11/25（水）何をしていたか');
  });
  it('returns null when there is no heading or no text', () => {
    expect(tableHeadline('本文だけ')).toBeNull();
    expect(tableHeadline(null)).toBeNull();
  });
});

describe('extractStats', () => {
  const md = [
    '- PC を操作していた時間：**11時間17分**（chiba-desktop 7時間29分）',
    '- スマホを使っていた時間：**5時間47分**／画面ロック解除 63 回',
  ].join('\n');
  it('pulls PC and phone totals from the summary', () => {
    expect(extractStats(md)).toEqual({ pc: '11時間17分', phone: '5時間47分' });
  });
  it('returns nulls when absent', () => {
    expect(extractStats('# none')).toEqual({ pc: null, phone: null });
    expect(extractStats(null)).toEqual({ pc: null, phone: null });
  });
});
