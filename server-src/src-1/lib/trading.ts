// Trading-platform adapter. Mirrors the operations listed in the roadmap
// (Create Account, Disable, Reset Password, Get Balance/Equity/Trades, etc.).
// The mock generates deterministic demo accounts so the platform is fully
// navigable without a live MT5/cTrader bridge. Replace with a real adapter by
// implementing TradingPlatform against your provider's API.

export type NewAccountInput = {
  userId: string;
  startingBalance: number;
  leverage: number;
  platform: string;
};

export type NewAccountResult = {
  accountNumber: string;
  server: string;
  login: string;
  investorPassword: string;
};

export interface TradingPlatform {
  readonly name: string;
  createAccount(input: NewAccountInput): Promise<NewAccountResult>;
  disableAccount(accountNumber: string): Promise<void>;
  resetPassword(accountNumber: string): Promise<{ password: string }>;
  getBalance(accountNumber: string): Promise<number>;
  getEquity(accountNumber: string): Promise<number>;
}

function randomDigits(n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

class MockTradingPlatform implements TradingPlatform {
  readonly name = 'mock';

  async createAccount(input: NewAccountInput): Promise<NewAccountResult> {
    return {
      accountNumber: randomDigits(8),
      server: `${input.platform}-Demo`,
      login: randomDigits(8),
      investorPassword: `inv_${randomDigits(6)}`,
    };
  }
  async disableAccount(): Promise<void> {
    /* no-op in mock */
  }
  async resetPassword(): Promise<{ password: string }> {
    return { password: `pw_${randomDigits(8)}` };
  }
  async getBalance(): Promise<number> {
    return 0;
  }
  async getEquity(): Promise<number> {
    return 0;
  }
}

export function getTradingPlatform(): TradingPlatform {
  switch (process.env.TRADING_PROVIDER) {
    // case 'mt5': return new MT5Adapter();
    case 'mock':
    default:
      return new MockTradingPlatform();
  }
}
