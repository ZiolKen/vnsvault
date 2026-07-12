import { Pool, PoolClient } from 'pg';
import { db } from '@/lib/db';
import { isValidUUID, slugify } from '@/lib/utils';

/**
 * Resolve a free-text translator value typed by the admin into a real
 * `translators.id` (UUID), creating the translator row on first use.
 *
 * Accepts:
 *  - undefined / '' / whitespace-only → returns null (no translator set)
 *  - an existing translator's UUID     → returned as-is if it actually exists
 *  - any plain text name               → looked up case-insensitively across
 *                                         all shards; if no match exists, a
 *                                         new `translators` row is created
 *
 * Lookups always fan out across every shard, since an existing translator
 * may have been created from any prior game submission, regardless of
 * which shard it landed on.
 *
 * The INSERT (only reached when truly new) is the one place shard
 * placement matters: `games.translator_id` is a foreign key, so a new
 * translator row MUST land on the same physical shard as the game row that
 * will reference it. Pass the active transaction `client` you already hold
 * (from withNewRowTransaction / withRowTransaction) so the insert is pinned
 * there; without a client, it falls back to the independently-picked
 * fill-target shard via `db.write`.
 */
export async function resolveTranslatorId(
  raw?: string | null,
  client?: PoolClient | Pool
): Promise<string | null> {
  const value = raw?.trim();
  if (!value) return null;

  if (isValidUUID(value)) {
    const existing = await db.fanOut<{ id: string }>(
      'SELECT id FROM translators WHERE id=$1',
      [value]
    );
    // Valid UUID that doesn't correspond to a real translator — treat the
    // raw value as a name instead of silently failing the FK insert.
    if (existing[0]) return existing[0].id;
  }

  const byName = await db.fanOut<{ id: string }>(
    'SELECT id FROM translators WHERE LOWER(name)=LOWER($1) LIMIT 1',
    [value]
  );
  if (byName[0]) return byName[0].id;

  const baseSlug = slugify(value) || 'translator';
  const collision = await db.fanOut<{ slug: string }>(
    'SELECT slug FROM translators WHERE slug=$1',
    [baseSlug]
  );
  const finalSlug = collision.length > 0 ? `${baseSlug}-${Date.now()}` : baseSlug;

  const insertSql = 'INSERT INTO translators (name, slug) VALUES ($1,$2) RETURNING id';
  const insertValues = [value, finalSlug];

  if (client) {
    const res = await client.query<{ id: string }>(insertSql, insertValues);
    return res.rows[0].id;
  }
  const created = await db.write<{ id: string }>(insertSql, insertValues);
  return created[0].id;
}
