import { notFound } from 'next/navigation';
import GameForm from '@/components/admin/GameForm';
import { db } from '@/lib/db';
import type { Metadata } from 'next';

interface Props { params: Promise<{ id: string }> }

export const metadata: Metadata = { title: 'Sửa Game | Admin' };

async function getGame(id: string) {
  try {
    // The game could be on any shard.
    const rows = await db.fanOut('SELECT * FROM games WHERE id=$1', [id]);
    if (!rows[0]) return null;
    const game = rows[0] as Record<string, unknown>;

    const [genres, downloads] = await Promise.all([
      db.fanOut<{ id: number; name: string; slug: string }>(
        'SELECT gn.id, gn.name, gn.slug FROM game_genres gg JOIN genres gn ON gn.id=gg.genre_id WHERE gg.game_id=$1',
        [id]
      ),
      db.fanOut<{ version: string; platform: string; url: string; label: string | null }>(
        'SELECT version, platform, url, label FROM game_downloads WHERE game_id=$1 ORDER BY created_at DESC',
        [id]
      ),
    ]);
    return { ...game, genres, downloads };
  } catch { return null; }
}

export default async function EditGamePage({ params }: Props) {
  const { id } = await params;
  const game = await getGame(id);
  if (!game) notFound();

  return <GameForm initial={game as Parameters<typeof GameForm>[0]['initial']} gameId={id} />;
}
