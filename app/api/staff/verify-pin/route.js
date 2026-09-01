import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getClientIp, isRateLimited, recordAttempt, findStaffByPin } from '@/lib/staffAuth';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

// General-purpose "does this PIN belong to any active staff member" check —
// deliberately not role-restricted, unlike /api/staff/authorize (manager-only
// step-up for void/menu edits). Used to gate actions that should require
// *some* staff PIN just to prove a real employee is doing this, without
// caring which role — e.g. opening the cash drawer outside of a payment,
// so a non-staff person (a kitchen hand with no PIN at all) can't just walk
// up and open it, but any cashier or manager can. Requires an existing valid
// session so this can't be used as a bare PIN-guessing endpoint on its own.
export async function POST(request) {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not logged in' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

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

  try {
    const ip = getClientIp(request);
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

    return NextResponse.json(
      { success: true, staffName: staff.name },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[POST /api/staff/verify-pin]', err.message);
    return NextResponse.json(
      { success: false, error: 'Verification is temporarily unavailable — try again' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
