import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { isShiftOpen } from '@/lib/shifts';
import { recordOrderEdited } from '@/lib/reports';

export const runtime = 'nodejs';

function printServerHeaders(extra = {}) {
  const headers = { ...extra };
  if (process.env.PRINT_API_KEY) {
    headers['x-api-key'] = process.env.PRINT_API_KEY;
  }
  return headers;
}

// Corrects a still-pending order's items/customer info — a cashier
// capability, same as placing the order in the first place (no manager
// step-up, unlike void). The print-server itself refuses anything not
// still 'pending', so a paid/voided order can't be silently rewritten here.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { orderNo, cust, lines, total } = body || {};
  if (!orderNo) {
    return NextResponse.json(
      { success: false, error: 'orderNo is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session?.role === 'cashier' && !(await isShiftOpen(session.shiftId))) {
    return NextResponse.json(
      { success: false, error: 'Your shift is not open — clock in again to edit orders' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) {
    console.error('[orders/edit] PRINT_SERVER_URL is not set');
    return NextResponse.json(
      { success: false, error: 'Print server not configured (PRINT_SERVER_URL missing)' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const res = await fetch(`${printServerUrl}/orders/edit`, {
      method: 'POST',
      headers: printServerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        orderNo, cust, lines, total,
        editedBy: session?.staffId ?? null,
        editedByName: session?.name ?? null,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: data.error || `Print server returned HTTP ${res.status}` },
        { status: res.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    await recordOrderEdited(orderNo, { cust, lines, total }).catch((err) =>
      console.error('[POST /api/orders/edit] reporting mirror failed:', err.message)
    );

    return NextResponse.json(
      { success: true, order: data.order },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[POST /api/orders/edit]', err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
