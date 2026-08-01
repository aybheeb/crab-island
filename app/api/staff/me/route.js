import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

export async function GET() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ success: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    { success: true, staff: { staffId: session.staffId, name: session.name, role: session.role } },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
