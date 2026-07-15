import AnnouncementForm from '@/components/admin/AnnouncementForm';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Thông Báo | Admin' };

export default function AdminAnnouncementPage() {
  return <AnnouncementForm />;
}
