import { NextResponse } from 'next/server';

// Both report routes take the same from/to query params (ISO instants —
// the client resolves period presets like "Last 7 Days" to concrete
// timestamps in the browser's timezone before calling here).
export function parseRange(request) {
  const { searchParams } = new URL(request.url);
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  if (!fromParam || !toParam) {
    return {
      range: null,
      error: NextResponse.json(
        { success: false, error: 'from and to query params are required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }

  const from = new Date(fromParam);
  const to = new Date(toParam);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return {
      range: null,
      error: NextResponse.json(
        { success: false, error: 'from/to must be valid dates' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      ),
    };
  }

  return { range: { from, to }, error: null };
}
