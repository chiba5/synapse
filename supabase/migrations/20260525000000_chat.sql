-- Channels table
CREATE TABLE channels (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO channels (name) VALUES ('general');

-- Messages table
CREATE TABLE messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  sender_email TEXT NOT NULL,
  body         TEXT,
  file_url     TEXT,
  file_name    TEXT,
  file_size    BIGINT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_has_content CHECK (body IS NOT NULL OR file_url IS NOT NULL)
);

CREATE INDEX idx_messages_channel ON messages(channel_id, created_at ASC);
