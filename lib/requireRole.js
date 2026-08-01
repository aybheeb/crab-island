import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from './session';

// Middleware already guarantees *some* valid session reached this route —
// this enforces the stricter "must be a manager" requirement server-side,
// so hiding a button in the UI is never the only thing stopping a cashier
// from calling a manager-only route directly.
export async function requireManagerSession() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session || session.role !== 'manager') {
    return {
      session: null,
      error: NextResponse.json(
        { success: false, error: 'Manager access required' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }
  return { session, error: null };
}
