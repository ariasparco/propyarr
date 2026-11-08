import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { ok, fail } from '@/lib/api';
import { triggerBotSyncAll } from '@/lib/monitor-source';
import { runMonitorSweep } from '@/lib/monitor-run';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Admin-only batch sync for every live account.
//
// Two steps, and the response says honestly how each one went. It used to
// report success unconditionally, so an admin looking at week-old numbers was
// told the sync had worked while the agent was not even running.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== 'ADMIN') return fail('forbidden', 403);

  // 1. Ask the terminal agent for fresh figures.
  const extraction = await triggerBotSyncAll();
  // 2. Re-evaluate every account regardless — the rules still need running
  //    against whatever data we do have, and a breach in stored data is real.
  const sweep = await runMonitorSweep();

  return ok({
    success: extraction.ok,
    extraction,
    checked: sweep.checked,
    failed: sweep.failed,
    message: extraction.ok
      ? `همگام‌سازی انجام شد — ${sweep.checked} حساب بررسی شد${
          sweep.failed ? `، ${sweep.failed} حساب نقض قانون داشت` : ''
        }.`
      : `اتصال به موتور متاتریدر برقرار نشد؛ ${sweep.checked} حساب با آخرین داده‌ی موجود بررسی شد. علت: ${
          extraction.reason ?? 'نامشخص'
        }`,
  });
}
