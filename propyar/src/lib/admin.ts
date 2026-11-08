import 'server-only';
import { prisma } from './prisma';
import { DEFAULT_RULES } from './constants';

export async function getAdminOverview() {
  const [users, paidOrders, revenueAgg, activeAccounts, pendingPayouts] =
    await Promise.all([
      prisma.user.count(),
      prisma.order.count({ where: { paymentStatus: 'PAID' } }),
      prisma.order.aggregate({
        _sum: { amount: true },
        where: { paymentStatus: 'PAID' },
      }),
      prisma.tradingAccount.count({
        where: { status: { in: ['ACTIVE', 'FUNDED'] } },
      }),
      prisma.payout.count({
        where: { status: { in: ['REQUESTED', 'APPROVED'] } },
      }),
    ]);
  return {
    users,
    paidOrders,
    revenue: revenueAgg._sum.amount ?? 0,
    activeAccounts,
    pendingPayouts,
  };
}

export async function getAllUsers() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { tradingAccounts: true, orders: true } } },
  });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    kycStatus: u.kycStatus,
    accounts: u._count.tradingAccounts,
    orders: u._count.orders,
    walletBalance: u.walletBalance,
    createdAt: u.createdAt.toISOString(),
  }));
}


export async function getAllOrders() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: {
        select: {
          email: true,
          name: true,
          country: true,
          kycStatus: true,
          phone: true,
        },
      },
      challenge: { select: { name: true, accountType: true } },
      tradingAccount: { select: { accountNumber: true } },
    },
  });

  // Which account each follow-on request came from, so the admin sees the stage.
  const sourceIds = orders
    .map((o) => o.sourceAccountId)
    .filter((id): id is string => Boolean(id));
  const sources = sourceIds.length
    ? await prisma.tradingAccount.findMany({
        where: { id: { in: sourceIds } },
        select: { id: true, accountNumber: true },
      })
    : [];
  const sourceById = new Map(sources.map((s) => [s.id, s.accountNumber]));

  return orders.map((o) => ({
    id: o.id,
    email: o.user.email,
    name: o.user.name,
    phone: o.user.phone ?? '',
    country: o.user.country ?? '',
    kyc: o.user.kycStatus,
    plan: o.challenge ? `${o.challenge.accountType} ${o.challenge.name}` : null,
    amount: o.amount,
    status: o.paymentStatus,
    method: o.paymentMethod,
    fulfillment: o.fulfillment,
    reviewStatus: o.reviewStatus,
    reviewNote: o.reviewNote,
    kind: o.kind,
    sourceAccount: o.sourceAccountId
      ? (sourceById.get(o.sourceAccountId) ?? null)
      : null,
    accountNumber: o.tradingAccount?.accountNumber ?? null,
    createdAt: o.createdAt.toISOString(),
  }));
}

export async function getKycRequests() {
  const rows = await prisma.kyc.findMany({
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { user: { select: { name: true, email: true, phone: true } } },
  });
  return rows.map((k) => ({
    id: k.id,
    name: k.user.name,
    email: k.user.email,
    phone: k.user.phone ?? '—',
    docType: k.docType,
    // Served through the authorised route, never as a public asset.
    imageUrl: `/api/kyc/image/${k.id}`,
    imageBackUrl: k.imageBackPath ? `/api/kyc/image/${k.id}?side=back` : null,
    nationalCode: k.nationalCode,
    rejectReason: k.rejectReason,
    status: k.status,
    createdAt: k.createdAt.toISOString(),
  }));
}

export async function getAllAccounts() {
  const accounts = await prisma.tradingAccount.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true, name: true, role: true } },
      challenge: { select: { name: true, accountType: true } },
      certificates: { select: { id: true, stage: true } },
    },
  });
  return accounts.map((a) => ({
    id: a.id,
    accountNumber: a.accountNumber,
    certificates: a.certificates,
    email: a.user.email,
    ownerName: a.user.name,
    // An account still attached to an admin never got assigned to its trader.
    // Everything that reads the owner is wrong until it is, including the name
    // printed on the certificate.
    adminOwned: a.user.role === 'ADMIN',
    plan: `${a.challenge.accountType} ${a.challenge.name}`,
    platform: a.platform,
    server: a.server,
    // Never the passwords themselves, only whether they are set. An admin needs
    // to know a credential is missing; nobody needs it echoed into a web page.
    hasPassword: Boolean(a.password?.trim() && a.password !== '••••••••'),
    hasInvestorPassword: Boolean(
      a.investorPassword?.trim() && a.investorPassword !== '••••••••',
    ),
    balance: a.balance,
    equity: a.equity,
    status: a.status,
    phase: a.phase,
    breachRule: a.breachRule,
    breachSource: a.breachSource,
    breachDetail: a.breachDetail,
    breachNote: a.breachNote,
    brokerUtcOffset: a.brokerUtcOffset,
    lastCheckedAt: a.lastCheckedAt?.toISOString() ?? null,
    lastSyncedAt: a.snapshotAt?.toISOString() ?? null,
    linked: Boolean(a.snapshotAt || a.metaApiId),
  }));
}

export async function getAllPayouts() {
  const payouts = await prisma.payout.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { email: true } },
      account: { select: { accountNumber: true } },
    },
  });
  return payouts.map((p) => ({
    id: p.id,
    email: p.user.email,
    accountNumber: p.account.accountNumber,
    amount: p.amount,
    method: p.method,
    wallet: p.wallet,
    status: p.status,
    splitPercent: p.splitPercent,
    refundAmount: p.refundAmount,
    txHash: p.txHash,
    network: p.network,
    createdAt: p.createdAt.toISOString(),
  }));
}

export async function getRules() {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'rules' } });
    if (setting) return { ...DEFAULT_RULES, ...JSON.parse(setting.value) };
  } catch {
    /* fall through */
  }
  return { ...DEFAULT_RULES };
}

export async function getAllReviews() {
  const rows = await prisma.review.findMany({
    orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    gender: r.gender,
    rating: r.rating,
    text: r.text,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  }));
}
