import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { isPinTaken } from '@/lib/staffAuth';
import { encryptPin } from '@/lib/pinCipher';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const PIN_PATTERN = /^\d{4,8}$/;

// Full staff roster, including deactivated accounts (so a manager can see
// and reactivate them) — never returns the pin itself, encrypted or
// otherwise; pinViewable just tells the UI whether "View PIN" can work for
// this row (false for legacy accounts still on the old bcrypt hash, which
// can never be decrypted — they need a PIN reset first).
export async function GET() {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { rows } = await query(
    'select id, name, role, active, created_at, (pin_encrypted is not null) as "pinViewable" from staff order by active desc, name asc'
  );
  return NextResponse.json(
    { success: true, staff: rows },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

// Creates a new staff account. Manager-only — a cashier never needs this,
// so unlike void/custom items there's no step-up fallback path.
export async function POST(request) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid JSON body' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { name, role, pin } = body || {};
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json(
      { success: false, error: 'Name is required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (role !== 'cashier' && role !== 'manager') {
    return NextResponse.json(
      { success: false, error: 'Role must be cashier or manager' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (typeof pin !== 'string' || !PIN_PATTERN.test(pin)) {
    return NextResponse.json(
      { success: false, error: 'PIN must be 4-8 digits' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (await isPinTaken(pin)) {
    return NextResponse.json(
      { success: false, error: 'That PIN is already in use by another active staff member' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { rows } = await query(
    'insert into staff (name, pin_encrypted, role) values ($1, $2, $3) returning id, name, role, active, created_at',
    [name.trim(), encryptPin(pin), role]
  );
  rows[0].pinViewable = true;

  return NextResponse.json(
    { success: true, staff: rows[0] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
