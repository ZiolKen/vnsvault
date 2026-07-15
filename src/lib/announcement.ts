/**
 * Shared server-side accessor for the `site_announcement` singleton row —
 * used by both the public GET /api/announcement and the admin GET/PUT
 * /api/admin/announcement routes so the "pick the freshest shard copy"
 * logic isn't duplicated between them.
 */
import { db } from '@/lib/db';
import type { Announcement, AnnouncementParagraph } from '@/types';

interface AnnouncementRow {
  enabled: boolean;
  version: number;
  title: string;
  body: AnnouncementParagraph[];
  snooze_hours: number;
  updated_at: string;
}

/**
 * The singleton row is seeded identically on every shard and kept in sync
 * by broadcast UPDATEs (see updateAnnouncement below), but a shard that
 * was briefly unreachable during a past save can lag behind. Reading via
 * fanOut and keeping the row with the highest `version` self-heals that —
 * every read serves the latest content regardless of which shard(s)
 * happened to answer.
 */
export async function getAnnouncement(): Promise<Announcement | null> {
  const rows = await db.fanOut<AnnouncementRow>(
    'SELECT enabled, version, title, body, snooze_hours, updated_at FROM site_announcement'
  );
  if (rows.length === 0) return null;

  const freshest = rows.reduce((best, row) => (row.version > best.version ? row : best));
  return {
    enabled: freshest.enabled,
    version: freshest.version,
    title: freshest.title,
    body: freshest.body ?? [],
    snoozeHours: freshest.snooze_hours,
    updatedAt: freshest.updated_at,
  };
}

export interface AnnouncementUpdateInput {
  enabled: boolean;
  title: string;
  body: AnnouncementParagraph[];
  snoozeHours: number;
}

/**
 * Broadcasts the update to every shard at once via fanOut (not the usual
 * single-shard `write()`) — see schema.sql's site_announcement comment for
 * why this table needs identical copies on every shard instead of living
 * on just one.
 */
export async function updateAnnouncement(input: AnnouncementUpdateInput): Promise<Announcement> {
  const rows = await db.fanOut<AnnouncementRow>(
    `UPDATE site_announcement
     SET enabled=$1, title=$2, body=$3::jsonb, snooze_hours=$4, version = version + 1
     WHERE id = TRUE
     RETURNING enabled, version, title, body, snooze_hours, updated_at`,
    [input.enabled, input.title, JSON.stringify(input.body), input.snoozeHours]
  );
  if (rows.length === 0) {
    throw new Error('site_announcement row missing on every shard — run npm run db:setup.');
  }
  const freshest = rows.reduce((best, row) => (row.version > best.version ? row : best));
  return {
    enabled: freshest.enabled,
    version: freshest.version,
    title: freshest.title,
    body: freshest.body ?? [],
    snoozeHours: freshest.snooze_hours,
    updatedAt: freshest.updated_at,
  };
}
