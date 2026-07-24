-- Migration 003: password reset tokens (forgot-password flow)
-- Run once on EACH shard (SHARD_0..SHARD_9), same convention as 002.
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS).
--
-- The reset token is stored HASHED (SHA-256), never raw, so a read-only leak
-- of the users table can't be used to reset anyone's password. The raw token
-- only ever lives inside the emailed link. Columns live directly on `users`
-- (not a side table) so they co-locate with the user row on whichever shard
-- holds it — the same reasoning behind the inline vip_permanent/vip_expires_at
-- columns.

ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMPTZ;

-- Partial index: only rows with a live reset request are indexed, keeping it
-- tiny (almost every user has NULL here at any given moment).
CREATE INDEX IF NOT EXISTS idx_users_reset_token
  ON users(reset_token_hash) WHERE reset_token_hash IS NOT NULL;
