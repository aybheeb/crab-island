import { cookies } from 'next/headers';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import { getMenu, getCategories } from '@/lib/menu';
import Login from '@/components/Login';
import App from '@/components/App';

export default async function Page() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session) return <Login />;

  const [menu, categories] = await Promise.all([getMenu(), getCategories()]);

  return <App staff={{ name: session.name, role: session.role }} menu={menu} categories={categories} />;
}
