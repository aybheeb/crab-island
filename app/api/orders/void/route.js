import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifySession, verifyStepUp, SESSION_COOKIE } from '@/lib/session';
import { recordOrderVoided } from '@/lib/reports';

export const runtime = 'nodejs';

function printServerHeaders(extra = {}) {
  const headers = { ...extra };
  if (process.env.PRINT_API_KEY) {
    headers['x-api-key'] = process.env.PRINT_API_KEY;
  }
  return headers;
}

// A manager acting on their own logged-in session is already authorized —
// no PIN re-entry needed. A cashier needs a manager to step up (PIN, short-
// lived token) instead, since their own session was never a manager's.
// Either way, `manager` below ends up holding whoever's identity actually
// authorized this specific void, for the audit trail.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { orderNo, reason, stepUpToken } = body || {};
  if (!orderNo) {
    return NextResponse.json(
      { success: false, error: 'orderNo is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);
  const manager = session?.role === 'manager'
    ? { staffId: session.staffId, name: session.name }
    : await verifyStepUp(stepUpToken);

  if (!manager) {
    return NextResponse.json(
      { success: false, error: 'Manager authorization required or expired — try again' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const printServerUrl = process.env.PRINT_SERVER_URL;
  if (!printServerUrl) {
    console.error('[orders/void] PRINT_SERVER_URL is not set');
    return NextResponse.json(
      { success: false, error: 'Print server not configured (PRINT_SERVER_URL missing)' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const res = await fetch(`${printServerUrl}/orders/void`, {
      method: 'POST',
      headers: printServerHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        orderNo,
        reason: reason || null,
        voidedBy: manager.staffId,
        voidedByName: manager.name,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Preserve the print server's status (404 not found, 409 already
      // voided) instead of collapsing every failure into a generic 500 —
      // those are client-facing conflicts, not server errors.
      return NextResponse.json(
        { success: false, error: data.error || `Print server returned HTTP ${res.status}` },
        { status: res.status, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Best-effort mirror into the durable reporting database — the
    // print-server call above already succeeded and is the real source of
    // truth, so a failure here must never fail this response. Awaited (not
    // fire-and-forget) since a serverless function can be frozen the instant
    // its response is sent.
    await recordOrderVoided(orderNo, {
      voidedBy: manager.staffId,
      voidedByName: manager.name,
      reason,
    }).catch((err) => console.error('[POST /api/orders/void] reporting mirror failed:', err.message));

    return NextResponse.json(
      { success: true, order: data.order },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    console.error('[POST /api/orders/void]', err.message);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 502, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
