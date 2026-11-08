// Periodic rule monitoring, so breaches are caught without an external cron
// service. Set MONITOR_INTERVAL_MINUTES=0 to turn it off and drive
// /api/cron/monitor instead (required if the app runs on more than one instance).
import { runMonitorSweep } from './lib/monitor-run';
import { sweepPendingUsdtOrders } from './lib/usdt-sweep';

// Seconds is the finer control; the older minutes setting still works and is
// used when no seconds value is given. A drawdown that is only noticed five
// minutes late is a drawdown the trader kept trading through, so the practical
// floor here is how fast the upstream data itself moves, not the timer.
const seconds = Number(
  process.env.MONITOR_INTERVAL_SECONDS ??
    Number(process.env.MONITOR_INTERVAL_MINUTES ?? 5) * 60,
);
const minutes = seconds / 60;

if (Number.isFinite(seconds) && seconds > 0) {
  let running = false;

  const tick = async () => {
    if (running) return; // never overlap sweeps
    running = true;
    try {
      const result = await runMonitorSweep();
      if (result.failed > 0) {
        console.info(
          `monitor sweep: ${result.checked} checked, ${result.failed} breached`,
        );
      }
    } catch (err) {
      console.error('monitor sweep failed', err);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(tick, seconds * 1000);
  interval.unref?.(); // do not hold the process open on shutdown
  console.info(
    `monitor scheduler active — every ${seconds < 60 ? `${seconds}s` : `${minutes} min`}`,
  );
}

// The crypto sweep keeps its own, slower clock. It reads the chain over public
// RPC nodes, so tying it to a fast monitoring interval would burn quota for
// nothing: a payment that arrives between checks is still found by the next
// one, and buyers are watching a page that polls on its own anyway.
{
  let running = false;
  const everyMs = Math.max(
    60_000,
    Number(process.env.USDT_SWEEP_SECONDS ?? 300) * 1000,
  );

  const sweep = async () => {
    if (running) return;
    running = true;
    try {
      const paid = await sweepPendingUsdtOrders();
      if (paid.settled > 0 || paid.expired > 0) {
        console.info(
          `usdt sweep: ${paid.settled} settled, ${paid.expired} expired`,
        );
      }
    } catch (err) {
      console.error('usdt sweep failed', err);
    } finally {
      running = false;
    }
  };

  const interval = setInterval(sweep, everyMs);
  interval.unref?.();
}
