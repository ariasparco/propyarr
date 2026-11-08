// Registers each live trading account with MetaApi and deploys it.
//
//   npx tsx scripts/metaapi-link.ts            # report only, changes nothing
//   npx tsx scripts/metaapi-link.ts --apply    # provision, deploy, store ids
//   npx tsx scripts/metaapi-link.ts --cleanup  # also remove MetaApi accounts
//                                              # no trading account points at
//   npx tsx scripts/metaapi-link.ts --only 5054963695 --apply
//                                              # just that one account
//   npx tsx scripts/metaapi-link.ts --status   # what MetaApi thinks of each
//                                              # linked account right now
//   npx tsx scripts/metaapi-link.ts --unlink --apply
//                                              # forget the ids and fall back
//                                              # to the terminal agent
//
// Why this exists
// ───────────────
// The terminal agent can only be logged into one account at a time, so it walks
// the roster in turn: while it watches one account for 75 seconds, the other
// three are completely unobserved. Coverage is capped at roughly 1/N no matter
// how the timings are tuned, and a breach on an unwatched account is invisible
// until its turn comes round again.
//
// MetaApi runs a dedicated terminal per account in its own cloud, permanently
// connected to the broker. Every account is live at the same time, there is no
// login/logout cycle, and reading one account costs nothing to the others — so
// coverage stops being a scheduling problem.
//
// The platform already speaks MetaApi (src/lib/monitor-source.ts); it simply
// never runs, because no trading account has a `metaApiId`. This fills that in.
import { PrismaClient } from '@prisma/client';

// Same override the app honours, so a rehearsal against the stand-in and the
// real thing go through identical code.
const PROVISIONING =
  process.env.METAAPI_PROVISIONING_BASE ||
  'https://mt-provisioning-api-v1.agiliumtrade.agiliumtrade.ai';

const apply = process.argv.includes('--apply');
const cleanup = process.argv.includes('--cleanup');
const status = process.argv.includes('--status');
const unlink = process.argv.includes('--unlink');
// Restricting to one account is how a paid subscription gets tested without
// committing every account to billing on the first run.
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

/**
 * `high` is what production wants and what MetaApi charges for; an unfunded
 * subscription is refused with "To allow high reliability please top up".
 * `regular` exists here so the whole pipeline can be proven end to end before
 * anyone pays, and switched over afterwards.
 */
const relIndex = process.argv.indexOf('--reliability');
const reliability =
  relIndex >= 0 && process.argv[relIndex + 1] === 'regular' ? 'regular' : 'high';

const token = (process.env.METAAPI_TOKEN ?? '').trim();
const region = process.env.METAAPI_REGION || 'london';

const prisma = new PrismaClient();

type MetaApiAccount = {
  _id: string;
  login?: string;
  name?: string;
  server?: string;
  region?: string;
  state?: string;
  connectionStatus?: string;
};

async function api(
  path: string,
  init: RequestInit = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const res = await fetch(`${PROVISIONING}${path}`, {
    ...init,
    headers: {
      'auth-token': token,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* keep the raw text */
  }
  return { ok: res.ok, status: res.status, body };
}

async function main() {
  if (!token) {
    console.error(
      'METAAPI_TOKEN is not set in .env — nothing to do.\n' +
        'The token is what lets the platform provision accounts; without it the\n' +
        'terminal agent remains the only data source.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    apply ? '── APPLYING ──\n' : '── DRY RUN (pass --apply to write) ──\n',
  );

  // ── Reachability ──────────────────────────────────────────
  // Doubles as the connectivity check: if the server cannot reach MetaApi, that
  // is the answer to whether this approach is available at all, and it is far
  // more useful to find out here than halfway through provisioning.
  let existing: MetaApiAccount[];
  try {
    const res = await api('/users/current/accounts?limit=1000');
    if (!res.ok) {
      console.error(
        `MetaApi refused the token (HTTP ${res.status}):`,
        JSON.stringify(res.body).slice(0, 300),
      );
      process.exitCode = 1;
      return;
    }
    const body = res.body as MetaApiAccount[] | { items?: MetaApiAccount[] };
    existing = Array.isArray(body) ? body : (body.items ?? []);
    console.log(`✓ MetaApi reachable — ${existing.length} account(s) registered\n`);
  } catch (err) {
    console.error(
      'Could not reach MetaApi from this machine:',
      (err as Error).message,
    );
    console.error(
      '\nIf this fails on the server but works elsewhere, the server cannot get\n' +
        'out to agiliumtrade.ai and this route is closed — the alternative is one\n' +
        'MetaTrader terminal per account on the VPS itself.',
    );
    process.exitCode = 1;
    return;
  }

  const byLogin = new Map(existing.map((a) => [String(a.login ?? ''), a]));
  const byId = new Map(existing.map((a) => [a._id, a]));

  // ── Accounts that need linking ────────────────────────────
  const accounts = await prisma.tradingAccount.findMany({
    where: {
      status: { in: ['ACTIVE', 'FUNDED'] },
      ...(only ? { accountNumber: only } : {}),
    },
    select: {
      id: true,
      accountNumber: true,
      server: true,
      investorPassword: true,
      metaApiId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // ── Unlink ────────────────────────────────────────────────
  // Clears the stored MetaApi ids so the platform falls back to the terminal
  // agent. Needed to undo a test run cleanly: ids pointing at a stand-in would
  // otherwise be tried against the real service and fail every read.
  if (unlink) {
    const linkedRows = accounts.filter((a) => a.metaApiId);
    if (linkedRows.length === 0) {
      console.log('Nothing is linked.');
      return;
    }
    for (const a of linkedRows) {
      console.log(`#${a.accountNumber}  unlink ${a.metaApiId}`);
      if (apply) {
        await prisma.tradingAccount.update({
          where: { id: a.id },
          data: { metaApiId: null },
        });
      }
    }
    console.log(
      apply
        ? `\n${linkedRows.length} account(s) unlinked — the terminal agent is the source again.`
        : '\nNothing was written — re-run with --apply.',
    );
    return;
  }

  if (only && accounts.length === 0) {
    console.error(
      `No live trading account with number ${only}. ` +
        'Check the number, and that the account is ACTIVE or FUNDED.',
    );
    process.exitCode = 1;
    return;
  }

  // ── Status only ───────────────────────────────────────────
  // What MetaApi thinks of each linked account right now. Provisioning is not
  // instant — an account sits in DEPLOYING for a few minutes before its cloud
  // terminal connects to the broker — and without this the only way to tell
  // whether it is working is to watch the platform's data stop being stale.
  if (status) {
    const linkedRows = accounts.filter((a) => a.metaApiId);
    if (linkedRows.length === 0) {
      console.log('No trading account is linked to MetaApi yet.');
      return;
    }
    for (const a of linkedRows) {
      const m = byId.get(a.metaApiId as string);
      if (!m) {
        console.log(
          `#${a.accountNumber}  ⚠ metaApiId ${a.metaApiId} is stored here but MetaApi does not know it`,
        );
        continue;
      }
      const ready = m.state === 'DEPLOYED' && m.connectionStatus === 'CONNECTED';
      console.log(
        `#${a.accountNumber}  ${ready ? '✓ live' : '… not ready'}  ` +
          `state=${m.state} connection=${m.connectionStatus} region=${m.region}`,
      );
    }
    return;
  }

  let linked = 0;
  let skipped = 0;

  for (const a of accounts) {
    const password = a.investorPassword?.trim();

    if (a.metaApiId) {
      console.log(`#${a.accountNumber}  already linked (${a.metaApiId})`);
      continue;
    }
    // The read-only password is what MetaApi signs in with. A blank or
    // placeholder value cannot be provisioned, and guessing would deploy an
    // account that silently never connects.
    if (!password || password === '••••••••') {
      console.log(`#${a.accountNumber}  SKIPPED — no investor password on file`);
      skipped += 1;
      continue;
    }

    const already = byLogin.get(a.accountNumber);
    if (already) {
      console.log(
        `#${a.accountNumber}  found in MetaApi (${already._id}, ${already.state}) → will reuse`,
      );
      if (apply) {
        await prisma.tradingAccount.update({
          where: { id: a.id },
          data: { metaApiId: already._id },
        });
        if (already.state !== 'DEPLOYED') {
          const dep = await api(`/users/current/accounts/${already._id}/deploy`, {
            method: 'POST',
          });
          console.log(`   deploy → HTTP ${dep.status}`);
        }
        linked += 1;
      }
      continue;
    }

    console.log(
      `#${a.accountNumber}  will provision on ${a.server} ` +
        `(region ${region}, ${reliability} reliability)`,
    );
    if (!apply) continue;

    const created = await api('/users/current/accounts', {
      method: 'POST',
      body: JSON.stringify({
        // `name` is what shows in the MetaApi dashboard; keeping the platform's
        // account number in it makes the two sides matchable by eye.
        name: `propino-${a.accountNumber}`,
        // g2 on purpose. The same account on g1 with high reliability costs
        // roughly three times as much per hour for no benefit here.
        type: 'cloud-g2',
        login: a.accountNumber,
        password,
        server: a.server,
        platform: 'mt5',
        magic: 0,
        region,
        reliability,
      }),
    });

    if (!created.ok) {
      console.log(
        `   ✗ provisioning failed (HTTP ${created.status}): ` +
          JSON.stringify(created.body).slice(0, 250),
      );
      skipped += 1;
      // MetaApi bills for repeated failed attempts to add an account. Stopping
      // at the first failure keeps a misconfiguration from becoming a charge
      // multiplied by the size of the roster.
      if (created.status === 403) {
        console.log(
          '\nStopping after the first refusal rather than retrying the whole roster.\n' +
            'MetaApi charges for repeated failed attempts, and the reason here is\n' +
            'the same for every account.',
        );
        break;
      }
      continue;
    }

    const id = (created.body as { id?: string; _id?: string })?.id ??
      (created.body as { _id?: string })?._id;
    if (!id) {
      console.log('   ✗ MetaApi returned no account id');
      skipped += 1;
      continue;
    }

    await prisma.tradingAccount.update({
      where: { id: a.id },
      data: { metaApiId: id },
    });
    const dep = await api(`/users/current/accounts/${id}/deploy`, {
      method: 'POST',
    });
    console.log(`   ✓ linked ${id} · deploy → HTTP ${dep.status}`);
    linked += 1;
  }

  // ── Orphans ───────────────────────────────────────────────
  // MetaApi bills per registered account, so accounts nothing points at are a
  // standing charge for data no one reads.
  //
  // Skipped entirely when --only narrowed the selection: every other account
  // would look like an orphan, and --cleanup would delete them.
  if (only) {
    console.log(`\n(--only ${only}: other accounts left untouched)`);
    console.log(
      `\n${linked} account(s) linked, ${skipped} skipped.` +
        (apply ? '' : '\nNothing was written — re-run with --apply.'),
    );
    return;
  }

  const wanted = new Set(accounts.map((a) => a.accountNumber));
  const orphans = existing.filter((a) => !wanted.has(String(a.login ?? '')));
  if (orphans.length) {
    console.log(`\n${orphans.length} MetaApi account(s) not used by the platform:`);
    for (const o of orphans) {
      console.log(`   • ${o.login} (${o._id}, ${o.state})`);
      if (cleanup && apply) {
        const del = await api(`/users/current/accounts/${o._id}`, {
          method: 'DELETE',
        });
        console.log(`     removed → HTTP ${del.status}`);
      }
    }
    if (!cleanup) {
      console.log('   (pass --cleanup --apply to remove them)');
    }
  }

  console.log(
    `\n${linked} account(s) linked, ${skipped} skipped.` +
      (apply ? '' : '\nNothing was written — re-run with --apply.'),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
