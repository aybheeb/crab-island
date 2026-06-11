import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request) {
  let order;
  try {
    order = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!order?.lines?.length) {
    return NextResponse.json({ success: false, error: 'Order has no items' }, { status: 400 });
  }

  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) {
    console.error('[print-ticket] PRINT_SERVER_URL is not set');
    return NextResponse.json(
      { success: false, error: 'Print server not configured (PRINT_SERVER_URL missing)' },
      { status: 503 }
    );
  }

  const headers = { 'Content-Type': 'application/json' };
  if (process.env.PRINT_API_KEY) {
    headers['x-api-key'] = process.env.PRINT_API_KEY;
  }

  try {
    const res = await fetch(`${printServerUrl}/print`, {
      method: 'POST',
      headers,
      body: JSON.stringify(order),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Print server returned HTTP ${res.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/print-ticket]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
