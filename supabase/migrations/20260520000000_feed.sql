-- reads.item_type CHECK を 'feed_item' に拡張
ALTER TABLE reads DROP CONSTRAINT IF EXISTS reads_item_type_check;
ALTER TABLE reads ADD CONSTRAINT reads_item_type_check
  CHECK (item_type IN ('daily_report', 'note', 'feed_item'));

-- フィードアイテム（X / RSS / WebSearch の収集結果）
CREATE TABLE feed_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source         TEXT NOT NULL CHECK (source IN ('x', 'rss', 'web_search')),
  source_url     TEXT,
  title          TEXT NOT NULL,
  body           TEXT,
  summary        TEXT,
  category       TEXT CHECK (category IN ('practical', 'knowledge', 'claude_runnable')),
  claude_runnable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_feed_items_created ON feed_items(created_at DESC);
CREATE INDEX idx_feed_items_source  ON feed_items(source, created_at DESC);
CREATE UNIQUE INDEX idx_feed_items_source_url ON feed_items(source_url) WHERE source_url IS NOT NULL;

CREATE TRIGGER trg_feed_items_updated_at
  BEFORE UPDATE ON feed_items FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Claude Code 試行ジョブキュー（承認制）
CREATE TABLE try_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id   UUID NOT NULL REFERENCES feed_items(id) ON DELETE CASCADE,
  requested_by   UUID NOT NULL REFERENCES profiles(id),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'running', 'done', 'failed')),
  result_summary TEXT,
  result_url     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_try_jobs_status  ON try_jobs(status, created_at DESC);
CREATE INDEX idx_try_jobs_item    ON try_jobs(feed_item_id);

CREATE TRIGGER trg_try_jobs_updated_at
  BEFORE UPDATE ON try_jobs FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
