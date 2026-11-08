import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { triggerBotSyncAll } from '@/lib/monitor-source';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

// Admin-only batch sync endpoint for all active accounts
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  const success = await triggerBotSyncAll();
  return ok({
    success,
    message: success
      ? 'همگام‌سازی تمامی حساب‌ها از طریق موتور متاتریدر با موفقیت آغاز شد.'
      : 'همگام‌سازی آغاز شد (در صورت فعال بودن ربات، حساب‌ها به‌روزرسانی می‌شوند).',
  });
}
