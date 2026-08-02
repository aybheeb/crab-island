import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { getSalesReport } from '@/lib/reports';
import { parseRange } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { range, error: rangeError } = parseRange(request);
  if (rangeError) return rangeError;

  const report = await getSalesReport(range);
  return NextResponse.json(
    { success: true, report },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
