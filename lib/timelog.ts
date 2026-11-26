// time-log（本人だけが見る前日の時間の使い方）の純粋ロジック。vitest で検査する。

export const MAX_FIELD_CHARS = 500_000;

export const TIMELOG_FIELDS = ['table_md', 'summary_md', 'diagnosis_html'] as const;
export type TimelogField = (typeof TIMELOG_FIELDS)[number];

export type TimelogPayload = { day: string } & Partial<Record<TimelogField, string>>;

/** 見てよいのは TIMELOG_OWNER_EMAIL と一致するメールだけ。未設定なら誰も見られない。 */
export function isTimelogOwner(email: string | null | undefined, ownerEnv: string | undefined): boolean {
  const owner = (ownerEnv ?? '').trim().toLowerCase();
  const me = (email ?? '').trim().toLowerCase();
  if (!owner || !me) return false;
  return owner === me;
}

export function isValidDay(day: unknown): day is string {
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

export function parseTimelogPayload(
  input: unknown,
): { ok: true; value: TimelogPayload } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'JSON object is required' };
  }
  const body = input as Record<string, unknown>;
  if (!isValidDay(body.day)) return { ok: false, error: 'day must be YYYY-MM-DD' };

  const value: TimelogPayload = { day: body.day };
  for (const key of TIMELOG_FIELDS) {
    const v = body[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string') return { ok: false, error: `${key} must be a string` };
    if (v.length > MAX_FIELD_CHARS) return { ok: false, error: `${key} is too large` };
    value[key] = v;
  }
  if (!TIMELOG_FIELDS.some((k) => value[k] !== undefined)) {
    return { ok: false, error: 'at least one of table_md / summary_md / diagnosis_html is required' };
  }
  return { ok: true, value };
}

/** 表の 1 行目の見出し（「11/25（水）何をしていたか」）。 */
export function tableHeadline(tableMd: string | null | undefined): string | null {
  if (!tableMd) return null;
  const m = tableMd.match(/^#+\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

/** まとめから PC とスマホの合計時間を拾う。 */
export function extractStats(summaryMd: string | null | undefined): { pc: string | null; phone: string | null } {
  const pick = (re: RegExp) => (summaryMd ? summaryMd.match(re)?.[1] ?? null : null);
  return {
    pc: pick(/PC を操作していた時間：\*\*([^*]+)\*\*/),
    phone: pick(/スマホを使っていた時間：\*\*([^*]+)\*\*/),
  };
}
