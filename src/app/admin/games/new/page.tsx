import GameForm from '@/components/admin/GameForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Thêm Game Mới | Admin' };

export default function NewGamePage() {
  return <GameForm />;
}
