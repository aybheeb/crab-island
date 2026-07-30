import { NextResponse } from 'next/server';
import { callPrintServer } from '../_lib/printServerRequest';

export const runtime = 'nodejs';

export async function POST(request) {
  let order;
  try {
    order = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!order?.lines?.length) {
    return NextResponse.json(
      { success: false, error: 'Order has no items' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { status, body } = await callPrintServer('/api/print-kitchen', '/print-kitchen', order);
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
