-- Quoted replies: a message can reference another message in the same channel.
-- ON DELETE SET NULL so deleting the original doesn't remove the reply.
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES messages(id) ON DELETE SET NULL;
