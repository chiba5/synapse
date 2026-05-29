-- Chat features: edit tracking, read receipts (2-person), emoji reactions

-- Edit tracking: NULL = never edited
ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;

-- Per-user read state per channel.
-- 2-person chat: a message is "read" when the OTHER participant's
-- last_read_at >= the message's created_at.
CREATE TABLE IF NOT EXISTS channel_reads (
  channel_id   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  reader_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, reader_id)
);

-- Emoji reactions. One row per (message, reader, emoji); toggled on/off.
CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  reader_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, reader_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_reactions_message ON message_reactions(message_id);
