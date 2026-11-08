// Plain, serializable view models passed from server components to the client.

export type AccountMetrics = {
  profit: number;
  profitPct: number;
  progressPct: number;
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
  profitTarget: number;
  dailyDrawdown: number;
  maxDrawdown: number;
  breachRule: string | null;
  advanceRequested: boolean;
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
