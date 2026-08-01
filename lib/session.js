import { SignJWT, jwtVerify } from 'jose';

const encoder = new TextEncoder();

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not set');
  return encoder.encode(secret);
}

export const SESSION_COOKIE = 'ci_session';

// Long enough to cover a full shift without re-login; clock-out / close-day
// still invalidate the underlying shift server-side well before this expires.
const SESSION_TTL = '16h';

// Just long enough for the cashier to submit the one manager-authorized
// action the PIN was entered for.
const STEPUP_TTL = '60s';

export async function signSession({ staffId, name, role, shiftId }) {
  return new SignJWT({ staffId, name, role, shiftId: shiftId ?? null, purpose: 'session' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(SESSION_TTL)
    .sign(secretKey());
}

export async function verifySession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.purpose === 'session' ? payload : null;
  } catch {
    return null;
  }
}

export async function signStepUp({ staffId, name }) {
  return new SignJWT({ staffId, name, purpose: 'stepup' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(STEPUP_TTL)
    .sign(secretKey());
}

export async function verifyStepUp(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.purpose === 'stepup' ? payload : null;
  } catch {
    return null;
  }
}
