import { NextRequest } from 'next/server';
import { ok, fail } from '@/lib/api';
import { runMonitorSweep } from '@/lib/monitor-run';
import { sweepPendingUsdtOrders } from '@/lib/usdt-sweep';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// External cron entry point. Protected by CRON_SECRET, sent either as
// `Authorization: Bearer <secret>` or `?key=<secret>`.
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return fail('cron_not_configured', 503);

  const header = req.headers.get('authorization') ?? '';
  const provided = header.startsWith('Bearer ')
    ? header.slice(7)
    : (req.nextUrl.searchParams.get('key') ?? '');
  if (provided !== secret) return fail('forbidden', 403);

  const [accounts, payments] = await Promise.all([
    runMonitorSweep(),
    sweepPendingUsdtOrders(),
  ]);
  return ok({ accounts, payments, at: new Date().toISOString() });
}

export const GET = handle;
export const POST = handle;
