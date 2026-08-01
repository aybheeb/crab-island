import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import Login from '@/components/Login';
import App from '@/components/App';

export default async function Page() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) return <Login />;

  return <App staff={{ name: session.name, role: session.role }} />;
}
