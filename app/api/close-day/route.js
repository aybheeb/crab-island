import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) {
    console.error('[close-day] PRINT_SERVER_URL is not set');
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
    const res = await fetch(`${printServerUrl}/close-day`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(20000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Print server returned HTTP ${res.status}`);
    }

    return NextResponse.json({ success: true, report: data.report });
  } catch (err) {
    console.error('[POST /api/close-day]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
