import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getClientIp, isRateLimited, recordAttempt, findStaffByPin } from '@/lib/staffAuth';
import { signSession, SESSION_COOKIE } from '@/lib/session';
import { openShiftFor } from '@/lib/shifts';

export const runtime = 'nodejs';

export async function POST(request) {
  const ip = getClientIp(request);

  let pin;
  try {
    ({ pin } = await request.json());
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!pin || typeof pin !== 'string') {
    return NextResponse.json(
      { success: false, error: 'PIN is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Everything past here touches the database — wrapped so a connection
  // hiccup comes back as a real JSON error instead of an empty response
  // body (which shows up client-side as "Unexpected end of JSON input").
  try {
    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts — try again in a few minutes' },
        { status: 429, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const staff = await findStaffByPin(pin);
    await recordAttempt(ip, !!staff);

    if (!staff) {
      return NextResponse.json(
        { success: false, error: 'Incorrect PIN' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Cashiers clock in as a side effect of logging in; managers don't carry
    // a shift (they're not being attributed sales, so there's nothing to open).
    const shiftId = staff.role === 'cashier' ? await openShiftFor(staff.id) : null;
    const token = await signSession({ staffId: staff.id, name: staff.name, role: staff.role, shiftId });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 16,
    });

    return NextResponse.json(
      { success: true, staff: { name: staff.name, role: staff.role } },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[POST /api/staff/login]', err.message);
    return NextResponse.json(
      { success: false, error: 'Login is temporarily unavailable — try again' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
