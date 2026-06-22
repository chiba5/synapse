-- Input v2: 関心度スコア + X ダイジェストのトピック列
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE feed_items ADD COLUMN IF NOT EXISTS topic TEXT;

-- source CHECK は既存のまま（'x','rss','web_search'）。X ダイジェストも source='x' を使う。

-- score 降順表示のための複合インデックス
CREATE INDEX IF NOT EXISTS idx_feed_items_score
  ON feed_items(score DESC, created_at DESC);
