// Block-explorer links for payout transaction hashes.

export const PAYOUT_NETWORKS = ['BEP20', 'TRC20', 'ERC20'] as const;
export type PayoutNetwork = (typeof PAYOUT_NETWORKS)[number];

/** A link anyone can open to follow the transfer, or null if unknown. */
export function txUrl(hash: string | null | undefined, network: string | null | undefined): string | null {
  if (!hash) return null;
  const h = hash.trim();
  switch (network) {
    case 'TRC20':
      return `https://tronscan.org/#/transaction/${h.replace(/^0x/, '')}`;
    case 'ERC20':
      return `https://etherscan.io/tx/${h}`;
    case 'BEP20':
    default:
      return `https://bscscan.com/tx/${h}`;
  }
}

/** First and last characters of a hash, for display. */
export function shortHash(hash: string): string {
  const h = hash.trim();
  return h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-6)}` : h;
}
