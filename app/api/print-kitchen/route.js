import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
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

  // Who printed this is derived from the verified session, never trusted
  // from the client body — same rule as order creation (app/api/orders).
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  const attributedOrder = { ...order, cashierId: session?.staffId ?? null, cashierName: session?.name ?? null };

  const { status, body } = await callPrintServer('/api/print-kitchen', '/print-kitchen', attributedOrder);
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
