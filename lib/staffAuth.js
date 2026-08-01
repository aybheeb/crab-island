import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query } from './db';
import { decryptPin } from './pinCipher';

const RATE_LIMIT_WINDOW_SECONDS = 300; // 5 minutes
const RATE_LIMIT_MAX_FAILURES = 5;

export function getClientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// PINs are short, so the real defense against brute force is limiting
// attempts per source IP, not the hash cost. Only failed attempts count
// against the limit, so a legitimate staff member who logs in normally
// never gets throttled by other people's failures... unless those failures
// are coming from the same IP (e.g. a shared register), which is the
// tradeoff of IP-based (rather than per-staff-row) limiting.
export async function isRateLimited(ip) {
  const { rows } = await query(
    `select count(*)::int as count from login_attempts
     where ip = $1 and success = false
       and created_at > now() - ($2 * interval '1 second')`,
    [ip, RATE_LIMIT_WINDOW_SECONDS]
  );
  return rows[0].count >= RATE_LIMIT_MAX_FAILURES;
}

export async function recordAttempt(ip, success) {
  await query('insert into login_attempts (ip, success) values ($1, $2)', [ip, success]);
}

// A row has exactly one of pin_encrypted (new — decrypt + constant-time
// compare) or pin_hash (legacy accounts created before PINs became
// manager-viewable — bcrypt compare, since a hash can't be decrypted at all).
async function pinMatches(pin, row) {
  if (row.pin_encrypted) {
    let decrypted;
    try {
      decrypted = decryptPin(row.pin_encrypted);
    } catch {
      return false;
    }
    const a = Buffer.from(pin);
    const b = Buffer.from(decrypted);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }
  if (row.pin_hash) {
    return bcrypt.compare(pin, row.pin_hash);
  }
  return false;
}

// Loops over active staff (or active staff of one role) checking the
// submitted PIN against each row — encrypted PINs can't be looked up by
// plaintext directly (each encryption uses a fresh random IV), and staff
// headcount here is small enough (tens of rows) that this is fast in practice.
export async function findStaffByPin(pin, { role } = {}) {
  const { rows } = await query(
    role
      ? 'select id, name, role, pin_hash, pin_encrypted from staff where active = true and role = $1'
      : 'select id, name, role, pin_hash, pin_encrypted from staff where active = true',
    role ? [role] : []
  );
  for (const row of rows) {
    if (await pinMatches(pin, row)) {
      return { id: row.id, name: row.name, role: row.role };
    }
  }
  return null;
}

// findStaffByPin resolves to whichever active row matches first, so two
// staff sharing a PIN means the second person silently logs in as the
// first. Call this before creating or resetting a PIN to reject collisions.
export async function isPinTaken(pin, { excludeStaffId } = {}) {
  const { rows } = await query(
    excludeStaffId
      ? 'select pin_hash, pin_encrypted from staff where active = true and id != $1'
      : 'select pin_hash, pin_encrypted from staff where active = true',
    excludeStaffId ? [excludeStaffId] : []
  );
  for (const row of rows) {
    if (await pinMatches(pin, row)) return true;
  }
  return false;
}
