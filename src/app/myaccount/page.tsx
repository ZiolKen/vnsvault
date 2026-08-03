import { redirect } from 'next/navigation';
import { getSession } from '@/lib/jwt';
import { db } from '@/lib/db';
import { computeVipStatus } from '@/lib/vip';
import type { Metadata } from 'next';
import MyAccountClient from './MyAccountClient';

export const metadata: Metadata = { title: 'Tài Khoản Của Tôi' };

export default async function MyAccountPage() {
  const session = await getSession();
  if (!session) redirect('/login?redirect=/myaccount');

  // Fetch full user profile from DB
  const rows = await db.fanOut<{
    id: string; username: string; email: string;
    role: string; avatar_url?: string; created_at: string;
    vip_permanent: boolean; vip_expires_at: string | null;
  }>(
    `SELECT id, username, email, role, avatar_url, created_at, vip_permanent, vip_expires_at
     FROM users WHERE id=$1 LIMIT 1`,
    [session.userId]
  );

  const row = rows[0];
  if (!row) redirect('/login');

  const { vip_permanent, vip_expires_at, ...user } = row;
  const vip = computeVipStatus({ vip_permanent, vip_expires_at });

  return <MyAccountClient user={user} vip={vip} />;
}
