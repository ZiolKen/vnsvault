-- Migration: games.updated_at should ignore view_count/download_count churn
-- Run this once on EACH of the 3 Supabase shards (SQL Editor in each
-- project's dashboard, or `psql "<direct-connection-url>" -f this-file`).
-- Safe to re-run (idempotent DROP+CREATE, matches schema.sql's style).
--
-- Why: view_count/download_count are bumped on nearly every page view /
-- download click. The old trigger bumped `updated_at` on ANY update to the
-- row, so "Mới cập nhật" (sort by updated_at) was effectively sorting by
-- "most recently viewed", not "most recently actually edited" — a popular
-- older game would jump back to the top the moment anyone viewed it,
-- burying newly-posted/edited games within minutes.

CREATE OR REPLACE FUNCTION update_games_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF (to_jsonb(OLD) - 'view_count' - 'download_count' - 'updated_at')
     IS DISTINCT FROM
     (to_jsonb(NEW) - 'view_count' - 'download_count' - 'updated_at') THEN
    NEW.updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS games_updated_at ON games;
CREATE TRIGGER games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_games_updated_at();

-- Verify: this should print 'update_games_updated_at' for the games table.
SELECT trigger_name, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'games';
