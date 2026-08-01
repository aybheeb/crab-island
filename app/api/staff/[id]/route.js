import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { isPinTaken } from '@/lib/staffAuth';
import { encryptPin } from '@/lib/pinCipher';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const PIN_PATTERN = /^\d{4,8}$/;

// Deactivating/deleting the last active manager would permanently lock
// everyone out of manager-only features (including undoing this very
// action) — refuse rather than allow a business-ending mistake. Returns an
// error response to return as-is, or null if it's safe to proceed.
async function lastActiveManagerError(existing, id) {
  if (existing.role !== 'manager' || !existing.active) return null;
  const { rows } = await query(
    "select count(*)::int as count from staff where role = 'manager' and active = true and id != $1",
    [id]
  );
  if (rows[0].count > 0) return null;
  return NextResponse.json(
    { success: false, error: 'Cannot remove the last active manager' },
    { status: 409, headers: { 'Cache-Control': 'no-store' } }
  );
}

// Updates active status and/or resets the PIN for one staff account.
// Manager-only. Supports either field independently so the UI can offer
// "Deactivate" and "Reset PIN" as separate actions without one requiring
// the other.
export async function PATCH(request, { params }) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { id } = await params;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { active, pin } = body || {};
  if (active === undefined && pin === undefined) {
    return NextResponse.json(
      { success: false, error: 'Nothing to update' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { rows: existingRows } = await query('select id, role, active from staff where id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Staff member not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (active === false) {
    const guardError = await lastActiveManagerError(existing, id);
    if (guardError) return guardError;
  }

  if (pin !== undefined) {
    if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
      return NextResponse.json(
        { success: false, error: 'PIN must be 4-8 digits' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }
    if (await isPinTaken(pin, { excludeStaffId: id })) {
      return NextResponse.json(
        { success: false, error: 'That PIN is already in use by another active staff member' },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }

  const sets = [];
  const values = [];
  let i = 1;
  if (active !== undefined) {
    sets.push(`active = $${i++}`);
    values.push(!!active);
  }
  if (pin !== undefined) {
    // Resetting a PIN also migrates a legacy (pin_hash-only) account onto
    // encrypted storage — clearing pin_hash makes that permanent, since the
    // old hash could never be decrypted anyway.
    sets.push(`pin_encrypted = $${i++}`, 'pin_hash = null');
    values.push(encryptPin(pin));
  }
  values.push(id);

  const { rows } = await query(
    `update staff set ${sets.join(', ')} where id = $${i} returning id, name, role, active, created_at, (pin_encrypted is not null) as "pinViewable"`,
    values
  );

  return NextResponse.json(
    { success: true, staff: rows[0] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// Permanently removes a staff account. Their shift history is deleted along
// with them (on delete cascade) — orders they touched keep their own
// cashierName/cashierId snapshot regardless, since that's copied at order
// creation, not looked up live against this table.
export async function DELETE(_request, { params }) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { id } = await params;

  const { rows: existingRows } = await query('select id, role, active from staff where id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Staff member not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const guardError = await lastActiveManagerError(existing, id);
  if (guardError) return guardError;

  await query('delete from staff where id = $1', [id]);

  return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
}
