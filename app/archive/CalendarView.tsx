'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { buildMonthGrid, shiftMonth } from '@/lib/archive';
import ArchiveItemCard from './ArchiveItemCard';
import type { ArchiveItem, ArchiveType, CalendarCounts } from './types';

const fetcher = (url: string) => fetch(url).then(r => r.json());

const DOT: Record<ArchiveType, string> = {
  report: 'bg-blue-500', news: 'bg-violet-500', note: 'bg-emerald-500',
};
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function CalendarView({
  initialMonth, type, onRead,
}: {
  initialMonth: string;
  type: string; // 'all' | ArchiveType
  onRead: (id: string) => void;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const { data: cal } = useSWR<{ counts: CalendarCounts }>(
    `/api/archive?view=calendar&month=${month}&type=${type}`,
    fetcher,
  );
  const counts = cal?.counts ?? {};

  const { data: dayData } = useSWR<{ data: ArchiveItem[] }>(
    selectedDay ? `/api/archive?view=list&date=${selectedDay}&type=${type}` : null,
    fetcher,
  );

  const cells = buildMonthGrid(month);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button className="text-muted-foreground hover:text-foreground" onClick={() => { setMonth(m => shiftMonth(m, -1)); setSelectedDay(null); }}>◀</button>
        <span className="text-sm font-medium">{month.replace('-', '年')}月</span>
        <button className="text-muted-foreground hover:text-foreground" onClick={() => { setMonth(m => shiftMonth(m, 1)); setSelectedDay(null); }}>▶</button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map(w => <div key={w} className="text-xs text-muted-foreground py-1">{w}</div>)}
        {cells.map((date, i) => {
          if (!date) return <div key={`b${i}`} />;
          const c = counts[date];
          const total = c ? c.report + c.news + c.note : 0;
          const dayNum = Number(date.slice(-2));
          const isSel = selectedDay === date;
          return (
            <button
              key={date}
              onClick={() => setSelectedDay(isSel ? null : date)}
              className={
                'aspect-square rounded-md border p-1 flex flex-col items-start text-left transition-colors ' +
                (isSel ? 'border-primary bg-primary/10' : 'border-border hover:bg-secondary/50')
              }
            >
              <span className="text-xs">{dayNum}</span>
              {total > 0 && (
                <span className="mt-auto flex items-center gap-0.5 flex-wrap">
                  {c.report > 0 && <span className={`h-1.5 w-1.5 rounded-full ${DOT.report}`} />}
                  {c.news > 0 && <span className={`h-1.5 w-1.5 rounded-full ${DOT.news}`} />}
                  {c.note > 0 && <span className={`h-1.5 w-1.5 rounded-full ${DOT.note}`} />}
                  <span className="text-[10px] text-muted-foreground">{total}</span>
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="space-y-2 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground">{selectedDay} の項目</p>
          {!dayData ? (
            <p className="text-sm text-muted-foreground">読み込み中…</p>
          ) : dayData.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">この日の項目はありません。</p>
          ) : (
            dayData.data.map(item => (
              <ArchiveItemCard key={`${item.type}:${item.id}`} item={item} onRead={onRead} />
            ))
          )}
        </div>
      )}
    </div>
  );
}
