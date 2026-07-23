import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET() {
  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) {
    console.error('[daily-report] PRINT_SERVER_URL is not set');
    return NextResponse.json(
      { success: false, error: 'Print server not configured (PRINT_SERVER_URL missing)' },
      { status: 503 }
    );
  }

  const headers = {};
  if (process.env.PRINT_API_KEY) {
    headers['x-api-key'] = process.env.PRINT_API_KEY;
  }

  try {
    const res = await fetch(`${printServerUrl}/report`, {
      headers,
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || `Print server returned HTTP ${res.status}`);
    }

    return NextResponse.json({ success: true, report: data.report });
  } catch (err) {
    console.error('[GET /api/daily-report]', err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
