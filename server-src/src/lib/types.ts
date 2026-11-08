// Plain, serializable view models passed from server components to the client.

export type AccountMetrics = {
  profit: number;
  profitPct: number;
  progressPct: number;
  /** The balance this stage has to reach. Zero for a funded account. */
  targetBalance: number;
  /** Still needed to get there — measured from where the balance is now. */
  targetRemaining: number;
  drawdownPct: number;
  winRate: number;
  floatingPl: number;
  targetReached: boolean;
  minDaysMet: boolean;
};

export type AccountView = {
  id: string;
  accountNumber: string;
  platform: string;
  server: string;
  password: string;
  investorPassword: string;
  startingBalance: number;
  balance: number;
  equity: number;
  status: string;
  phase: string;
  tradingDays: number;
  challengeName: string;
  accountType: string;
  // The target for the phase the account is *in*, not the plan's headline
  // figure. Phase 2 is a smaller number than phase 1, and a funded account has
  // no target at all — showing the plan's 10% on all three was simply wrong.
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  breachRule: string | null;
  // AUTO | ADMIN, and the admin's own words when it was ADMIN. The trader is
  // owed the reason a person closed their account, not just the fact of it.
  breachSource: string | null;
  breachNote: string | null;
  /**
   * The trader's outstanding request to move to the next stage, if any, and
   * what staff wrote when they judged it. Null once there is nothing pending.
   */
  advanceRequest: {
    state: 'PENDING' | 'APPROVED' | 'REJECTED';
    note: string | null;
    at: string;
  } | null;
  lastSyncedAt: string | null;
  certificates: Array<{ id: string; stage: string; note: string }>;
  metrics: AccountMetrics;
};

export type PayoutView = {
  id: string;
  amount: number;
  currency: string;
  method: string;
  wallet: string;
  status: string;
  createdAt: string;
  accountNumber: string;
};

export type DashboardSummary = {
  activeAccounts: number;
  totalProfit: number;
  pendingPayouts: number;
  winRate: number;
};

export type PlanView = {
  id: string;
  slug: string;
  name: string;
  accountType: string;
  price: number;
  virtualCapital: number;
  profitTarget: number;
  profitTargetP2: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  floatingRisk: number;
  minTradingDays: number;
  leverage: number;
  profitSplit: number;
  popular: boolean;
  comingSoon: boolean;
};
