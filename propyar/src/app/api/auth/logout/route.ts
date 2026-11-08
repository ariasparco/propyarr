import { clearSession, getSession } from '@/lib/auth';
import { ok, audit } from '@/lib/api';

export async function POST() {
  const session = await getSession();
  await clearSession();
  await audit('user.logout', session?.sub);
  return ok({ success: true });
}
