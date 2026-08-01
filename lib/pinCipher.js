import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey() {
  const secret = process.env.PIN_ENCRYPTION_KEY;
  if (!secret) throw new Error('PIN_ENCRYPTION_KEY is not set');
  const key = Buffer.from(secret, 'base64');
  if (key.length !== 32) throw new Error('PIN_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  return key;
}

// Reversible, unlike bcrypt — a manager can look up an existing PIN later
// (app/api/staff/[id]/pin), which is the whole point of switching away from
// hashing. The real-world tradeoff: anyone who gets this key plus database
// access (or exploits a bug that leaks either) recovers every PIN in
// plaintext, not just a hash they'd have to crack. Chosen deliberately over
// keeping PINs hash-only and unrecoverable.
export function encryptPin(pin) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(pin, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptPin(payload) {
  const buf = Buffer.from(payload, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
