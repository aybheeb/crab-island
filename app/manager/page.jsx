import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import ManagerView from '@/components/ManagerView';

export default async function ManagerPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session || session.role !== 'manager') {
    redirect('/');
  }

  return <ManagerView staff={{ name: session.name, role: session.role }} />;
}
