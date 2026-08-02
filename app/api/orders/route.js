import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { isShiftOpen } from '@/lib/shifts';
import { recordPendingOrder } from '@/lib/reports';

export const runtime = 'nodejs';

function printServerHeaders(extra = {}) {
  const headers = { ...extra };
  if (process.env.PRINT_API_KEY) {
    headers['x-api-key'] = process.env.PRINT_API_KEY;
  }
  return headers;
}

function missingPrintServerResponse(tag) {
  console.error(`[${tag}] PRINT_SERVER_URL is not set`);
  return NextResponse.json(
    { success: false, error: 'Print server not configured (PRINT_SERVER_URL missing)' },
    { status: 503 }
  );
}

// Creates a new order as "pending" — placed but not yet paid. Called as soon
// as the cashier places an order, whether they're collecting payment now or
// the customer is paying later on pickup.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.orderNo || !body?.ts) {
    return NextResponse.json({ success: false, error: 'Order missing orderNo/ts' }, { status: 400 });
  }

  // Attribution is derived from the verified session, never trusted from the
  // client body — middleware already required a valid session to reach here.
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  if (session?.role === 'cashier' && !(await isShiftOpen(session.shiftId))) {
    return NextResponse.json(
      { success: false, error: 'Your shift is not open — clock in again to place orders' },
      { status: 409 }
    );
  }

  // Custom-priced items are a cashier capability, same as everything else on
  // the register — no manager gate here. (Editing/adding permanent menu
  // items is a different, still manager-only capability.)
  const attributedBody = {
    ...body,
    cashierId: session?.staffId ?? null,
    cashierName: session?.name ?? null,
    shiftId: session?.shiftId ?? null,
  };

  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) return missingPrintServerResponse('POST /api/orders');

  try {
    const res = await fetch(`${printServerUrl}/orders`, {
      method: 'POST',
      headers: printServerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(attributedBody),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Print server returned HTTP ${res.status}`);

    // Best-effort mirror into the durable reporting database — the
    // print-server call above already succeeded and is the real source of
    // truth, so a failure here must never fail this response. Awaited
    // (not fire-and-forget) since a serverless function can be frozen the
    // instant its response is sent, which would silently drop an
    // un-awaited write.
    await recordPendingOrder(attributedBody).catch((err) =>
      console.error('[POST /api/orders] reporting mirror failed:', err.message)
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/orders]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// Full current-day order list (pending + paid) — used to restore the
// cashier's UI state after a page refresh.
export async function GET() {
  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) return missingPrintServerResponse('GET /api/orders');

  try {
    const res = await fetch(`${printServerUrl}/orders`, {
      headers: printServerHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Print server returned HTTP ${res.status}`);

    return NextResponse.json({ success: true, orders: data.orders || [] });
  } catch (err) {
    console.error('[GET /api/orders]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
