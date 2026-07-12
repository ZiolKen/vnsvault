import { redirect } from 'next/navigation';
import { getSession } from '@/lib/jwt';
import AdminLayoutClient from './AdminLayoutClient';

export const metadata = { title: 'Admin Panel | VNSVault' };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.role !== 'admin') redirect('/login');

  return (
    <AdminLayoutClient username={session.username}>
      {children}
    </AdminLayoutClient>
  );
}
