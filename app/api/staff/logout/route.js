import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { closeShift } from '@/lib/shifts';

export const runtime = 'nodejs';

export async function POST() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session?.shiftId) {
    await closeShift(session.shiftId);
  }
  cookieStore.delete(SESSION_COOKIE);
  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
