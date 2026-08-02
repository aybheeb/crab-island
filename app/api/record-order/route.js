import { NextResponse } from 'next/server';
import { recordOrderPaid } from '@/lib/reports';

export const runtime = 'nodejs';

// Marks a previously-created order (see /api/orders) as paid — the one-way
// "pending" -> "paid" transition. Line items/customer info are immutable;
// `total` may still be adjusted here to the settled amount actually charged
// (e.g. an EBT cooking-fee surcharge), see orderStore.markOrderPaid.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body?.orderNo) {
    return NextResponse.json({ success: false, error: 'orderNo is required' }, { status: 400 });
  }

  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) {
    console.error('[record-order] PRINT_SERVER_URL is not set');
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
    const res = await fetch(`${printServerUrl}/orders/pay`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Print server returned HTTP ${res.status}`);
    }

    // Best-effort mirror into the durable reporting database — the
    // print-server call above already succeeded and is the real source of
    // truth, so a failure here must never fail this response. Awaited (not
    // fire-and-forget) since a serverless function can be frozen the instant
    // its response is sent.
    await recordOrderPaid(body.orderNo, body).catch((err) =>
      console.error('[POST /api/record-order] reporting mirror failed:', err.message)
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/record-order]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
