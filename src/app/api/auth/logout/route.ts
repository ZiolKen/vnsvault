import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/jwt';

export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ success: true });
  return clearSessionCookie(res);
}
