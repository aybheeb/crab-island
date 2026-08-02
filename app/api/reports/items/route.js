import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { getItemBreakdown, getCategoryBreakdown } from '@/lib/reports';
import { parseRange } from '../_shared';

export const runtime = 'nodejs';

export async function GET(request) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { range, error: rangeError } = parseRange(request);
  if (rangeError) return rangeError;

  const [items, categories] = await Promise.all([
    getItemBreakdown(range),
    getCategoryBreakdown(range),
  ]);

  return NextResponse.json(
    { success: true, items, categories },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
