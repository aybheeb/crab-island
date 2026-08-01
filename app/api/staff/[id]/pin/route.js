import { NextResponse } from 'next/server';
import { requireManagerSession } from '@/lib/requireRole';
import { decryptPin } from '@/lib/pinCipher';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

// Manager-only. Only works for accounts already migrated to encrypted
// storage (created or PIN-reset since encryption was added) — a legacy
// bcrypt hash can never be decrypted, so those need a PIN reset first, not
// a viewer.
export async function GET(_request, { params }) {
  const { error: authError } = await requireManagerSession();
  if (authError) return authError;

  const { id } = await params;

  const { rows } = await query('select pin_encrypted from staff where id = $1', [id]);
  const row = rows[0];
  if (!row) {
    return NextResponse.json(
      { success: false, error: 'Staff member not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  if (!row.pin_encrypted) {
    return NextResponse.json(
      { success: false, error: 'This PIN was set before viewing was supported — reset it to enable viewing' },
      { status: 409, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { success: true, pin: decryptPin(row.pin_encrypted) },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
