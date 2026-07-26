import { NextResponse } from 'next/server';

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

  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) return missingPrintServerResponse('POST /api/orders');

  try {
    const res = await fetch(`${printServerUrl}/orders`, {
      method: 'POST',
      headers: printServerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Print server returned HTTP ${res.status}`);

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
