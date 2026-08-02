import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { getDailyTotals } from '@/lib/reports';
import { parseRange } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { range, error: rangeError } = parseRange(request);
  if (rangeError) return rangeError;

  const daily = await getDailyTotals(range);
  return NextResponse.json(
    { success: true, daily },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
