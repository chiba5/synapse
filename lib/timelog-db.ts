import { getServiceClient } from './supabase';
import { extractStats, tableHeadline } from './timelog';
import type { TimelogDay, TimelogListItem } from '@/app/timelog/types';

export async function listTimelogDays(limit = 120): Promise<TimelogListItem[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('timelog_days')
    .select('day, table_md, summary_md, diagnosis_html, updated_at')
    .order('day', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r) => {
    const stats = extractStats(r.summary_md);
    return {
      day: r.day as string,
      headline: tableHeadline(r.table_md),
      pc: stats.pc,
      phone: stats.phone,
      has_table: !!r.table_md,
      has_diagnosis: !!r.diagnosis_html,
      updated_at: r.updated_at as string,
    };
  });
}

export async function getAdjacentDays(day: string): Promise<{ prev: string | null; next: string | null }> {
  const db = getServiceClient();
  const [prev, next] = await Promise.all([
    db.from('timelog_days').select('day').lt('day', day).order('day', { ascending: false }).limit(1),
    db.from('timelog_days').select('day').gt('day', day).order('day', { ascending: true }).limit(1),
  ]);
  return {
    prev: (prev.data?.[0]?.day as string | undefined) ?? null,
    next: (next.data?.[0]?.day as string | undefined) ?? null,
  };
}

export async function getTimelogDay(day: string): Promise<TimelogDay | null> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('timelog_days')
    .select('day, table_md, summary_md, diagnosis_html, updated_at')
    .eq('day', day)
    .maybeSingle();
  if (error) throw error;
  return (data as TimelogDay | null) ?? null;
}
