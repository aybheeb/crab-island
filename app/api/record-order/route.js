import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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
    const res = await fetch(`${printServerUrl}/orders`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Print server returned HTTP ${res.status}`);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[POST /api/record-order]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
