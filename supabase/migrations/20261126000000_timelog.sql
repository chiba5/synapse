-- time-log：本人（TIMELOG_OWNER_EMAIL）だけが見る、前日の時間の使い方の表と診断（2026-11-26）
-- 送り手は ~/work/life/time-log/push_synapse.py → POST /api/timelog（day で upsert）
CREATE TABLE timelog_days (
  day            DATE PRIMARY KEY,
  table_md       TEXT,
  summary_md     TEXT,
  diagnosis_html TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_timelog_days_updated_at
  BEFORE UPDATE ON timelog_days FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- 個人の行動記録なので anon / authenticated からは一切読めないようにする（service role だけが触る）
ALTER TABLE timelog_days ENABLE ROW LEVEL SECURITY;
