import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import MenuManagementView from '@/components/MenuManagementView';

export default async function MenuManagementPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session || session.role !== 'manager') {
    redirect('/');
  }

  return <MenuManagementView staff={{ name: session.name, role: session.role }} />;
}
