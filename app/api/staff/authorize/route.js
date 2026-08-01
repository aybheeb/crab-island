import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getClientIp, isRateLimited, recordAttempt, findStaffByPin } from '@/lib/staffAuth';
import { verifySession, signStepUp, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

// Step-up authorization for a manager-gated action (void, menu edit, custom
// price) while a cashier stays logged in. Requires an existing valid session
// so this can't be used as a bare PIN-guessing endpoint by itself — you have
// to already be logged in as *someone* to attempt it.
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

  // Everything past here touches the database — wrapped so a connection
  // hiccup comes back as a real JSON error instead of an empty response body.
  try {
    const ip = getClientIp(request);
    if (await isRateLimited(ip)) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts — try again in a few minutes' },
        { status: 429, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const manager = await findStaffByPin(pin, { role: 'manager' });
    await recordAttempt(ip, !!manager);

    if (!manager) {
      return NextResponse.json(
        { success: false, error: 'Incorrect manager PIN' },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const token = await signStepUp({ staffId: manager.id, name: manager.name });
    return NextResponse.json(
      { success: true, token, managerName: manager.name },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[POST /api/staff/authorize]', err.message);
    return NextResponse.json(
      { success: false, error: 'Authorization is temporarily unavailable — try again' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
