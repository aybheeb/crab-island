import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from '@/lib/session';
import ReportsView from '@/components/ReportsView';

export default async function ReportsPage() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE)?.value);

  if (!session || session.role !== 'manager') {
    redirect('/');
  }

  return <ReportsView staff={{ name: session.name, role: session.role }} />;
}
