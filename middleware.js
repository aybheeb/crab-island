import { NextResponse } from 'next/server';
import { verifySession, SESSION_COOKIE } from '@/lib/session';

export const runtime = 'nodejs';

// Only the login endpoint is reachable without a session — every other API
// route (print, orders, staff/authorize, staff/me, ...) requires one. Page
// requests aren't gated here; app/page.jsx itself renders the PIN pad in
// place of the app when there's no valid session.
const PUBLIC_API_PATHS = new Set(['/api/staff/login']);

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (PUBLIC_API_PATHS.has(pathname)) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Not logged in' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*'],
};
