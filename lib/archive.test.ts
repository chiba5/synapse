import { describe, it, expect } from 'vitest';
import {
  escapeIlike,
  toJstDate,
  makeExcerpt,
  normalizeReport,
  normalizeNews,
  normalizeNote,
  mergeByCreatedAtDesc,
  aggregateCalendar,
  jstMonthRangeUtc,
  jstDayRangeUtc,
  buildMonthGrid,
  shiftMonth,
  applyReadState,
  READ_ITEM_TYPE,
} from './archive';
import type { ArchiveItem } from '../app/archive/types';

describe('escapeIlike', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeIlike('50%_x\\')).toBe('50\\%\\_x\\\\');
  });
});

describe('toJstDate', () => {
  it('rolls a late-UTC time into the next JST day', () => {
    expect(toJstDate('2026-05-28T16:30:00Z')).toBe('2026-05-29');
  });
  it('keeps an early-UTC time on the same JST day', () => {
    expect(toJstDate('2026-05-28T14:59:00Z')).toBe('2026-05-28');
  });
});

describe('makeExcerpt', () => {
  it('collapses whitespace and truncates long text', () => {
    const long = 'a'.repeat(200);
    const out = makeExcerpt(long);
    expect(out.endsWith('…')).toBe(true);
    expect(out.length).toBe(141); // 140 + ellipsis
  });
  it('returns empty string for null', () => {
    expect(makeExcerpt(null)).toBe('');
  });
});

describe('normalizers', () => {
  it('normalizeReport uses report_date as date and builds a title', () => {
    const r = normalizeReport(
      { id: 'r1', report_date: '2026-05-29', body: 'done', created_at: '2026-05-29T01:00:00Z', author: { id: 'p1', email: 'a@b.c', display_name: null } },
      false,
    );
    expect(r.type).toBe('report');
    expect(r.date).toBe('2026-05-29');
    expect(r.title).toBe('日報 2026-05-29');
    expect(r.author?.email).toBe('a@b.c');
  });

  it('normalizeNews maps news fields and derives JST date', () => {
    const n = normalizeNews(
      { id: 'f1', source: 'x', source_url: 'https://x.com/p', title: 'GPT', body: null, summary: 'sum', category: 'practical', claude_runnable: false, created_at: '2026-05-28T16:00:00Z' },
      true,
    );
    expect(n.type).toBe('news');
    expect(n.date).toBe('2026-05-29');
    expect(n.url).toBe('https://x.com/p');
    expect(n.category).toBe('practical');
    expect(n.is_read).toBe(true);
  });

  it('normalizeNote falls back to body when title is empty', () => {
    const n = normalizeNote(
      { id: 'no1', title: '   ', body: 'hello world', created_at: '2026-05-29T02:00:00Z', author: [{ id: 'p1', email: 'a@b.c', display_name: 'A' }] },
      false,
    );
    expect(n.type).toBe('note');
    expect(n.title).toBe('hello world');
    expect(n.author?.display_name).toBe('A'); // array embed picks first
  });
});

describe('mergeByCreatedAtDesc', () => {
  it('sorts items newest first', () => {
    const items = [
      { created_at: '2026-05-01T00:00:00Z' },
      { created_at: '2026-05-03T00:00:00Z' },
      { created_at: '2026-05-02T00:00:00Z' },
    ] as ArchiveItem[];
    const out = mergeByCreatedAtDesc(items);
    expect(out.map(i => i.created_at)).toEqual([
      '2026-05-03T00:00:00Z',
      '2026-05-02T00:00:00Z',
      '2026-05-01T00:00:00Z',
    ]);
  });
});

describe('aggregateCalendar', () => {
  it('counts entries per date and type', () => {
    const counts = aggregateCalendar([
      { type: 'news', date: '2026-05-29' },
      { type: 'news', date: '2026-05-29' },
      { type: 'report', date: '2026-05-29' },
      { type: 'note', date: '2026-05-28' },
    ]);
    expect(counts['2026-05-29']).toEqual({ report: 1, news: 2, note: 0 });
    expect(counts['2026-05-28']).toEqual({ report: 0, news: 0, note: 1 });
  });
});

describe('jstMonthRangeUtc', () => {
  it('computes UTC bounds for a JST month', () => {
    const r = jstMonthRangeUtc('2026-05');
    expect(r.startUtc).toBe('2026-04-30T15:00:00.000Z');
    expect(r.endUtc).toBe('2026-05-31T15:00:00.000Z');
    expect(r.firstDay).toBe('2026-05-01');
    expect(r.nextFirstDay).toBe('2026-06-01');
  });
  it('wraps to next year in December', () => {
    expect(jstMonthRangeUtc('2026-12').nextFirstDay).toBe('2027-01-01');
  });
});

describe('jstDayRangeUtc', () => {
  it('computes UTC bounds for a single JST day', () => {
    const r = jstDayRangeUtc('2026-05-29');
    expect(r.startUtc).toBe('2026-05-28T15:00:00.000Z');
    expect(r.endUtc).toBe('2026-05-29T15:00:00.000Z');
  });
});

describe('buildMonthGrid', () => {
  it('pads leading blanks and fills full weeks', () => {
    // 2026-05-01 is a Friday (getUTCDay = 5)
    const cells = buildMonthGrid('2026-05');
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 5)).toEqual([null, null, null, null, null]);
    expect(cells[5]).toBe('2026-05-01');
    expect(cells).toContain('2026-05-31');
  });
});

describe('shiftMonth', () => {
  it('moves forward and backward across year boundaries', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('applyReadState', () => {
  it('marks items read using type-prefixed keys', () => {
    const items = [
      { id: 'a', type: 'report' } as ArchiveItem,
      { id: 'b', type: 'news' } as ArchiveItem,
    ];
    const set = new Set([`${READ_ITEM_TYPE.report}:a`]);
    applyReadState(items, set);
    expect(items[0].is_read).toBe(true);
    expect(items[1].is_read).toBe(false);
  });
});
